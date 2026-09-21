-- ============================================================
-- SMART FEEDBACK & REVIEW MANAGEMENT SYSTEM
-- Supabase Schema + RLS (Step 1: Fondasi Aman)
-- ============================================================

-- Ekstensi yang dibutuhkan
create extension if not exists "pgcrypto"; -- untuk gen_random_uuid() & crypt()

-- ============================================================
-- 1. TABEL: products
-- ============================================================
-- Catatan penting: activation_pin TIDAK disimpan plaintext.
-- Disimpan sebagai pin_hash (crypt/bcrypt) supaya tidak bisa
-- dibaca langsung meski database bocor.
-- Kolom owner_id ditambahkan (di luar spek awal) agar RLS bisa
-- membedakan "toko A hanya boleh lihat data toko A sendiri".

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  short_code text unique not null,
  pin_hash text not null,               -- hasil crypt(pin, gen_salt('bf'))
  business_name text,
  google_review_url text,
  owner_whatsapp text,
  owner_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default false,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_short_code on products (short_code);
create index if not exists idx_products_owner_id on products (owner_id);

-- Trigger auto-update updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
before update on products
for each row execute function set_updated_at();

-- ============================================================
-- 2. TABEL: scan_logs
-- ============================================================
create table if not exists scan_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  ip_hash text,          -- simpan hash IP (bukan IP asli) untuk dedup anti-bot
  user_agent text
);

create index if not exists idx_scan_logs_product_id on scan_logs (product_id);

-- ============================================================
-- 3. TABEL: feedbacks
-- ============================================================
create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  customer_name text,
  complaint_text text not null,
  photo_path text,        -- path di storage bucket, BUKAN url publik
  status text not null default 'Pending' check (status in ('Pending','Resolved')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedbacks_product_id on feedbacks (product_id);

-- ============================================================
-- 4. TABEL: activation_attempts (rate limiting PIN)
-- ============================================================
create table if not exists activation_attempts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  success boolean not null default false,
  ip_hash text
);

create index if not exists idx_activation_attempts_product_id
  on activation_attempts (product_id, attempted_at);

-- ============================================================
-- 5. TABEL: admin_actions (audit log super admin)
-- ============================================================
create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  product_id uuid references products(id) on delete set null,
  action text not null,        -- 'suspend' | 'unsuspend' | 'override_edit' | 'reset_pin' | 'unbind'
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. HELPER FUNCTION: cek role super admin
-- ============================================================
-- Role disimpan di raw_app_meta_data (TIDAK bisa diubah user sendiri,
-- hanya lewat service role / dashboard Supabase) -> aman dari eskalasi hak akses.
create or replace function is_super_admin()
returns boolean as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  );
$$ language sql stable;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================
alter table products enable row level security;
alter table scan_logs enable row level security;
alter table feedbacks enable row level security;
alter table activation_attempts enable row level security;
alter table admin_actions enable row level security;

-- --- products ---
-- TIDAK ada policy SELECT untuk anon/public di tabel ini secara langsung
-- (supaya pin_hash tidak pernah ke-expose). Akses publik untuk halaman
-- /r/[uid] dan /feedback/[uid] WAJIB lewat view products_public di bawah,
-- atau lewat server action yang pakai service role key.

create policy "owner_select_own_product"
on products for select
using (auth.uid() = owner_id or is_super_admin());

create policy "owner_update_own_product"
on products for update
using (auth.uid() = owner_id or is_super_admin());

create policy "super_admin_insert_product"
on products for insert
with check (is_super_admin());

create policy "super_admin_delete_product"
on products for delete
using (is_super_admin());

-- --- View aman untuk halaman publik (tanpa pin_hash) ---
create or replace view products_public as
select id, short_code, business_name, google_review_url,
       owner_whatsapp, is_active, is_suspended
from products;

grant select on products_public to anon, authenticated;

-- --- scan_logs ---
create policy "public_insert_scan_log"
on scan_logs for insert
to anon, authenticated
with check (true);

create policy "owner_select_own_scan_logs"
on scan_logs for select
using (
  exists (
    select 1 from products p
    where p.id = scan_logs.product_id
    and (p.owner_id = auth.uid() or is_super_admin())
  )
);

-- --- feedbacks ---
create policy "public_insert_feedback"
on feedbacks for insert
to anon, authenticated
with check (true);

create policy "owner_select_own_feedbacks"
on feedbacks for select
using (
  exists (
    select 1 from products p
    where p.id = feedbacks.product_id
    and (p.owner_id = auth.uid() or is_super_admin())
  )
);

create policy "owner_update_own_feedbacks"
on feedbacks for update
using (
  exists (
    select 1 from products p
    where p.id = feedbacks.product_id
    and (p.owner_id = auth.uid() or is_super_admin())
  )
);

-- --- activation_attempts ---
-- Hanya diakses lewat service role (server action), tidak ada policy publik.
-- RLS aktif tapi tanpa policy = default deny untuk anon/authenticated.

-- --- admin_actions ---
create policy "super_admin_all_admin_actions"
on admin_actions for all
using (is_super_admin())
with check (is_super_admin());

-- ============================================================
-- 8. STORAGE BUCKET: complaint-photos
-- ============================================================
-- Jalankan ini di SQL Editor Supabase, atau buat bucket manual
-- lalu jalankan policy di bawah.

insert into storage.buckets (id, name, public)
values ('complaint-photos', 'complaint-photos', false)
on conflict (id) do nothing;
-- public = false: foto TIDAK bisa diakses lewat URL publik permanen.
-- Untuk kirim link foto ke WhatsApp owner, generate SIGNED URL
-- (misal berlaku 7 hari) di server action saat feedback disimpan.

create policy "public_insert_complaint_photo"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'complaint-photos');

create policy "owner_select_own_complaint_photo"
on storage.objects for select
using (
  bucket_id = 'complaint-photos'
  and (
    is_super_admin()
    or exists (
      select 1 from feedbacks f
      join products p on p.id = f.product_id
      where f.photo_path = storage.objects.name
      and p.owner_id = auth.uid()
    )
  )
);

-- ============================================================
-- SELESAI. Langkah selanjutnya: jalankan file ini di
-- Supabase SQL Editor (Project > SQL Editor > New Query > Run).
-- ============================================================
