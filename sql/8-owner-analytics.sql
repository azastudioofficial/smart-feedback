-- ============================================================
-- ANALYTICS OWNER: agregasi di database (1 query kecil, bukan
-- menarik ribuan baris ke server).
-- Jalankan SEKALI di Supabase SQL Editor - SEBELUM deploy kodenya.
-- ============================================================
-- Hasil fungsi = JSON kecil yang ukurannya TETAP berapa pun jumlah
-- scan-nya (maks 90 hari x 24 jam sel, biasanya jauh lebih sedikit):
--   scans:  [[hariWIB, jam, jumlah], ...]
--   clicks: [[hariWIB, jumlah], ...]
-- hariWIB = hari ke-N sejak 1 Jan 1970 dalam WIB (UTC+7), rumus yang
-- SAMA persis dengan wibDayIndex() di lib/analytics.ts.

-- Index gabungan: filter toko + rentang waktu langsung lewat index,
-- tanpa membaca seluruh baris toko itu.
create index if not exists idx_scan_logs_product_time
  on scan_logs (product_id, scanned_at);

create index if not exists idx_positive_clicks_product_time
  on positive_clicks (product_id, created_at);

create or replace function owner_analytics(
  p_product_id uuid,
  p_days int default 90
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select now() - make_interval(days => least(greatest(p_days, 1), 90)) as since
  ),
  s as (
    select
      ((floor(extract(epoch from l.scanned_at))::bigint + 25200) / 86400)::int as d,
      (((floor(extract(epoch from l.scanned_at))::bigint + 25200) % 86400) / 3600)::int as h,
      count(*)::int as n
    from scan_logs l, win
    where l.product_id = p_product_id
      and l.scanned_at >= win.since
    group by 1, 2
  ),
  c as (
    select
      ((floor(extract(epoch from k.created_at))::bigint + 25200) / 86400)::int as d,
      count(*)::int as n
    from positive_clicks k, win
    where k.product_id = p_product_id
      and k.created_at >= win.since
    group by 1
  )
  select jsonb_build_object(
    'scans',
      coalesce((select jsonb_agg(jsonb_build_array(d, h, n) order by d, h) from s), '[]'::jsonb),
    'clicks',
      coalesce((select jsonb_agg(jsonb_build_array(d, n) order by d) from c), '[]'::jsonb)
  );
$$;

-- Keamanan: fungsi ini menerima product_id apa saja, jadi HANYA boleh
-- dipanggil dari server (service_role) - yang sudah memastikan toko itu
-- milik owner yang login. Tanpa ini, siapa pun bisa memanggilnya lewat
-- API publik dengan menebak product_id.
revoke all on function owner_analytics(uuid, int) from public, anon, authenticated;
grant execute on function owner_analytics(uuid, int) to service_role;

-- Cek hasil (ganti dengan id produk asli):
-- select owner_analytics('00000000-0000-0000-0000-000000000000');
