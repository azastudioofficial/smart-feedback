-- ============================================================
-- PAKET LAYANAN: Basic vs Pro
-- Jalankan SEKALI di Supabase SQL Editor.
-- ============================================================
-- Basic = scan QR langsung menuju Google Review (tanpa dasbor).
-- Pro   = alur lengkap: pilihan Puas/Kurang Puas, form keluhan,
--         WhatsApp owner, dan akses penuh ke dasbor.

-- 1. Kolom plan. Dibuat dengan default 'pro' dulu supaya SEMUA kartu
--    yang sudah ada tetap Pro (tidak ada pelanggan lama yang turun paket).
alter table products
  add column if not exists plan text not null default 'pro'
  check (plan in ('basic', 'pro'));

-- 2. Setelah kartu lama aman, kartu BARU otomatis Basic.
alter table products alter column plan set default 'basic';

create index if not exists idx_products_plan on products (plan);

-- 3. Kunci kolom plan: hanya Super Admin yang boleh mengubahnya lewat
--    sesi login. Tanpa ini, owner bisa upgrade dirinya sendiri gratis
--    (kunci anon Supabase itu publik & policy owner_update_own_product
--    mengizinkan update kolom apa saja).
--    - Service role (server action) & SQL Editor: auth.uid() = null -> lolos.
--    - Owner / reseller yang login: ditolak.
create or replace function protect_plan_column()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan
     and auth.uid() is not null
     and not is_super_admin() then
    raise exception 'Hanya Super Admin yang boleh mengubah paket layanan.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_plan on products;
create trigger trg_protect_plan
before update of plan on products
for each row execute function protect_plan_column();

-- Cek hasil:
-- select plan, count(*) from products group by plan;
