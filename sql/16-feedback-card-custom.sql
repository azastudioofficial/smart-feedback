-- ============================================================
-- 16-feedback-card-custom.sql
-- Owner Pro boleh mengganti IKON, JUDUL, dan KETERANGAN dari dua kartu
-- di halaman feedback pelanggan:
--   - kartu Review            (review_card_*)
--   - kartu Layanan Pelanggan (complaint_card_*)
-- Kolom kosong (NULL) = pelanggan melihat tampilan bawaan, persis seperti
-- sekarang. Jadi menjalankan file ini TIDAK mengubah tampilan toko mana pun.
--
-- URUTAN PENTING: jalankan file ini LEBIH DULU, baru commit kode baru ke
-- GitHub. (Dasbor owner membaca kolom-kolom ini; kalau belum ada, halaman
-- dasbor gagal dimuat. Halaman feedback PELANGGAN tetap aman walau
-- kolomnya belum ada - kode sudah dibuat gagal-aman di sisi itu.)
--
-- AMAN: hanya MENAMBAH kolom (semua boleh kosong). Tidak ada data yang
-- diubah atau dihapus. Aman dijalankan berulang kali.
-- ============================================================

-- ------------------------------------------------------------
-- LANGKAH 1 - Kolom
-- ------------------------------------------------------------
alter table public.products
  add column if not exists review_card_title        text,
  add column if not exists review_card_description  text,
  add column if not exists review_card_icon_url     text,
  add column if not exists complaint_card_title       text,
  add column if not exists complaint_card_description text,
  add column if not exists complaint_card_icon_url    text;

-- ------------------------------------------------------------
-- LANGKAH 2 - Batasan (pagar terakhir kalau ada yang menulis langsung
-- lewat API Supabase, melewati validasi aplikasi)
-- Kolom baru -> belum ada data -> constraint langsung aman dipasang.
--  - judul   maksimal 40 karakter
--  - keterangan maksimal 120 karakter
--  - ikon    harus alamat gambar Cloudinary (https://res.cloudinary.com/...)
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_card_custom_ok'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_card_custom_ok check (
        (review_card_title is null or char_length(review_card_title) <= 40)
        and (complaint_card_title is null or char_length(complaint_card_title) <= 40)
        and (review_card_description is null or char_length(review_card_description) <= 120)
        and (complaint_card_description is null or char_length(complaint_card_description) <= 120)
        and (review_card_icon_url is null
             or (char_length(review_card_icon_url) <= 500
                 and review_card_icon_url ~* '^https://res\.cloudinary\.com/'))
        and (complaint_card_icon_url is null
             or (char_length(complaint_card_icon_url) <= 500
                 and complaint_card_icon_url ~* '^https://res\.cloudinary\.com/'))
      );
  end if;
end
$$;

-- ------------------------------------------------------------
-- Cek hasil:
--   select column_name from information_schema.columns
--    where table_name = 'products'
--      and column_name like '%card_%' and column_name not like 'card_seq'
--    order by column_name;
--   -- harus 6 baris
--
-- Batalkan (kalau perlu) - kode lama tidak membaca kolom ini:
--   alter table public.products drop constraint if exists products_card_custom_ok;
--   alter table public.products
--     drop column if exists review_card_title,
--     drop column if exists review_card_description,
--     drop column if exists review_card_icon_url,
--     drop column if exists complaint_card_title,
--     drop column if exists complaint_card_description,
--     drop column if exists complaint_card_icon_url;
-- ============================================================
