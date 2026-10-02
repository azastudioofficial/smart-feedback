-- ============================================================
-- 9-sync-schema.sql
-- Menyamakan folder sql/ dengan database produksi.
--
-- Kolom-kolom di bawah ini SUDAH ADA di database yang berjalan
-- (diambil dari information_schema), tapi dulu ditambahkan manual
-- lewat SQL Editor sehingga tidak pernah tercatat di file 1-8.
-- Tanpa file ini, membangun ulang database dari repo (akun Supabase
-- baru, staging, dsb.) menghasilkan tabel yang kekurangan kolom dan
-- aplikasi akan error.
--
-- AMAN dijalankan berulang kali (semua pakai IF NOT EXISTS) dan AMAN
-- dijalankan di database produksi - tidak mengubah/menghapus data.
--
-- URUTAN di database baru: jalankan 1 s/d 8, lalu file ini, lalu
-- bagian fungsi & tabel resellers (lihat catatan di paling bawah).
-- ============================================================

-- ------------------------------------------------------------
-- feedbacks
-- ------------------------------------------------------------
alter table feedbacks
  add column if not exists photo_url text,              -- URL Cloudinary (foto baru); photo_path = Storage lama
  add column if not exists photo_short_code text,       -- kode link pendek /p/[kode] untuk foto di pesan WhatsApp
  add column if not exists is_anonymous boolean not null default false;

comment on column feedbacks.photo_url is
  'URL foto bukti di Cloudinary. Foto lama (sebelum pindah ke Cloudinary) memakai photo_path di bucket complaint-photos.';
comment on column feedbacks.photo_short_code is
  'Kode link pendek /p/[kode] yang redirect ke photo_url.';
comment on column feedbacks.is_anonymous is
  'true = nama disembunyikan, laporan hanya masuk dashboard owner (tanpa WhatsApp).';

-- Link /p/[kode] mencari baris lewat kolom ini. Index biasa (bukan
-- UNIQUE) sengaja dipilih supaya aman dijalankan di data yang sudah ada.
create index if not exists idx_feedbacks_photo_short_code
  on feedbacks (photo_short_code)
  where photo_short_code is not null;

-- ------------------------------------------------------------
-- products
-- ------------------------------------------------------------
alter table products
  add column if not exists logo_url text,
  add column if not exists cover_image_url text,
  add column if not exists cover_position text,
  add column if not exists brand_color text,
  add column if not exists tagline text,                -- ada di database, saat ini tidak dipakai kode
  add column if not exists reseller_id uuid,            -- FK ke resellers: lihat catatan di bawah
  add column if not exists pending_review boolean not null default false,
  add column if not exists terms_accepted_at timestamptz;

comment on column products.logo_url is
  'Logo toko (URL Cloudinary; logo lama bisa berupa URL bucket business-logos).';
comment on column products.cover_image_url is 'Foto sampul halaman feedback (Cloudinary).';
comment on column products.cover_position is 'Posisi fokus foto sampul (object-position).';
comment on column products.brand_color is 'Warna brand hex (#RRGGBB) - dasar tema halaman feedback.';
comment on column products.pending_review is
  'true = owner sudah mengisi aktivasi dan menunggu persetujuan admin/reseller.';
comment on column products.terms_accepted_at is
  'Waktu owner menyetujui Syarat & Ketentuan saat aktivasi.';

create index if not exists idx_products_reseller_id
  on products (reseller_id)
  where reseller_id is not null;

-- ============================================================
-- BELUM TERCATAT DI REPO (perlu diekspor dari database produksi):
--   Fungsi : admin_generate_products, admin_dashboard_stats, admin_db_size
--   Tabel  : resellers (+ policy RLS-nya dan FK products.reseller_id)
-- (admin_reset_product sudah dicatat di 10-admin-reset-product.sql)
-- Simpan hasil ekspor sebagai sql/11-admin-functions-resellers.sql.
-- ============================================================
