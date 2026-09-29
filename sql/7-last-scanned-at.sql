-- ============================================================
-- WAKTU SCAN TERAKHIR (products.last_scanned_at)
-- Jalankan SEKALI di Supabase SQL Editor.
-- ============================================================

alter table products add column if not exists last_scanned_at timestamptz;

-- Isi dari riwayat scan yang sudah ada.
update products p
set last_scanned_at = s.last_scan
from (
  select product_id, max(scanned_at) as last_scan
  from scan_logs
  group by product_id
) s
where s.product_id = p.id;

-- Setiap scan baru otomatis memperbarui kolomnya. SECURITY DEFINER
-- karena yang menyisipkan scan_logs adalah pelanggan (anon) yang tidak
-- punya hak update ke tabel products.
create or replace function touch_product_last_scan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update products
  set last_scanned_at = greatest(coalesce(last_scanned_at, new.scanned_at), new.scanned_at)
  where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists trg_scan_logs_touch_product on scan_logs;
create trigger trg_scan_logs_touch_product
after insert on scan_logs
for each row execute function touch_product_last_scan();

-- Cek hasil:
-- select short_code, last_scanned_at from products order by last_scanned_at desc nulls last limit 10;
