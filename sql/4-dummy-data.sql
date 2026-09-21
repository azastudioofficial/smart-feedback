-- ============================================================
-- DATA DUMMY untuk testing alur /r/[uid]
-- Jalankan di Supabase SQL Editor (setelah schema.sql)
-- ============================================================

-- Produk #1: BELUM AKTIF -> untuk tes redirect ke /activate/[id]
insert into products (short_code, pin_hash, business_name, is_active, is_suspended)
values (
  'TESTAB',
  crypt('123456', gen_salt('bf')),   -- PIN mentah untuk testing: 123456
  'Warung Contoh Belum Aktif',
  false,
  false
);

-- Produk #2: SUDAH AKTIF -> untuk tes redirect ke /feedback/[id]
insert into products (
  short_code, pin_hash, business_name,
  google_review_url, owner_whatsapp, is_active, is_suspended
)
values (
  'TESTCD',
  crypt('123456', gen_salt('bf')),
  'Kedai Kopi Contoh Aktif',
  'https://g.page/r/contoh-review-link/review',
  '081234567890',
  true,
  false
);

-- Produk #3: DITANGGUHKAN -> untuk tes halaman "Layanan Ditangguhkan"
insert into products (short_code, pin_hash, business_name, is_active, is_suspended)
values (
  'TESTEF',
  crypt('123456', gen_salt('bf')),
  'Toko Contoh Suspended',
  true,
  true
);

-- ============================================================
-- Cek hasil insert + catat id UUID masing-masing untuk ditest manual
-- ============================================================
select id, short_code, business_name, is_active, is_suspended
from products
where short_code in ('TESTAB', 'TESTCD', 'TESTEF');
