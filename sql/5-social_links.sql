-- ============================================================
-- 5. FITUR: "Connect with Us" - tautan sosial/toko online
-- ============================================================
-- Kolom baru di tabel products: social_links (jsonb).
-- Format tiap item: { "id": "...", "platform": "instagram", "label": null, "url": "https://..." }
-- platform yang didukung: instagram | tiktok | shopee | website |
-- catalog | facebook | youtube | whatsapp | other
--
-- Dipakai untuk bagian "Terhubung dengan Kami" di halaman feedback
-- pelanggan (/feedback/[id]) - collapsible di bagian bawah kartu,
-- kalau di-klik baru menampilkan tombol-tombol link ini.
-- Kolom ini sudah otomatis ke-cover oleh RLS "owner_update_own_product"
-- yang sudah ada di 1-schema.sql (tidak perlu policy baru).

alter table products
  add column if not exists social_links jsonb not null default '[]'::jsonb;

comment on column products.social_links is
  'Array tautan sosial/toko online milik toko (Instagram, Website, Katalog, TikTok, Shopee, dst), ditampilkan sebagai bagian "Terhubung dengan Kami" di halaman feedback pelanggan.';
