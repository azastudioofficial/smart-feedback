-- ============================================================
-- TAMBAHAN SCHEMA: tabel positive_clicks
-- Jalankan di Supabase SQL Editor
-- ============================================================
-- Mencatat setiap klik tombol "Puas/Bagus" di halaman feedback,
-- supaya tab Analytics bisa hitung rasio Puas vs Kurang Puas.

create table if not exists positive_clicks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_positive_clicks_product_id
  on positive_clicks (product_id);

alter table positive_clicks enable row level security;

create policy "public_insert_positive_click"
on positive_clicks for insert
to anon, authenticated
with check (true);

create policy "owner_select_own_positive_clicks"
on positive_clicks for select
using (
  exists (
    select 1 from products p
    where p.id = positive_clicks.product_id
    and (p.owner_id = auth.uid() or is_super_admin())
  )
);
