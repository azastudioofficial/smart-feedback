-- ============================================================
-- 14-stock-activation.sql
-- Fitur "Aktifkan Stok": kartu kosong yang ditandai stok aktif akan
-- langsung aktif saat pembeli mengisi form aktivasi, tanpa menunggu
-- persetujuan admin/reseller. Kartu yang tidak ditandai tetap lewat
-- alur permohonan seperti biasa.
--
-- URUTAN PENTING: jalankan file ini LEBIH DULU, baru commit kode baru
-- ke GitHub. (Kode baru membaca kolom stock_activated; kalau kolomnya
-- belum ada, tabel kartu di dasbor admin/reseller gagal dimuat.)
--
-- AMAN: hanya MENAMBAH kolom (default false = perilaku lama tidak
-- berubah) dan mengunci kolom itu dari owner. Tidak ada data dihapus
-- atau diubah. Aman dijalankan berulang.
-- ============================================================

-- ------------------------------------------------------------
-- LANGKAH 1 - Kolom penanda
-- ------------------------------------------------------------
alter table products
  add column if not exists stock_activated boolean not null default false;

comment on column products.stock_activated is
  'true = kartu kosong yang sudah disetujui di muka (stok aktif): pembeli yang mengaktivasi langsung aktif tanpa persetujuan. Dikembalikan ke false begitu dipakai.';

-- ------------------------------------------------------------
-- LANGKAH 2 - Kunci kolom dari owner (WAJIB untuk keamanan)
-- ------------------------------------------------------------
-- Tanpa ini, owner yang login bisa mengisi stock_activated pada
-- kartunya sendiri lewat API Supabase; kalau kartu itu kemudian
-- di-reset dan dijual lagi, pembeli berikutnya otomatis aktif tanpa
-- persetujuan admin.
--
-- Ini adalah fungsi protect_owner_columns yang SUDAH ADA di produksi
-- (dipakai trigger trg_protect_owner_columns), dengan SATU tambahan:
-- 'stock_activated' di daftar kolom. Logika lainnya tidak diubah.
--
-- Sebelum menjalankan, bandingkan dengan yang ada sekarang:
--   select pg_get_functiondef('public.protect_owner_columns()'::regprocedure);
-- Kalau isinya berbeda dari versi di bawah (selain baris tambahan),
-- JANGAN jalankan langkah 2 - kirim hasilnya dulu untuk dicek.
create or replace function public.protect_owner_columns()
 returns trigger
 language plpgsql
as $function$
declare
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_col  text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if v_role in ('super_admin', 'reseller') then
    return new;
  end if;

  -- Dibandingkan lewat jsonb supaya tidak error kalau ada kolom yang
  -- suatu saat dihapus dari tabel.
  foreach v_col in array array[
    'is_active', 'is_suspended', 'pending_review',
    'reseller_id', 'owner_id', 'short_code',
    'pin_hash', 'terms_accepted_at', 'created_at',
    'stock_activated'
  ]
  loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception 'Kolom % hanya boleh diubah oleh admin/reseller.', v_col;
    end if;
  end loop;

  return new;
end;
$function$;

-- ------------------------------------------------------------
-- Cek hasil:
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_name = 'products' and column_name = 'stock_activated';
--   -- harus 1 baris: boolean, default false
--
-- Batalkan (kalau perlu) - kode lama tidak membaca kolom ini:
--   alter table products drop column if exists stock_activated;
--   (lalu kembalikan fungsi protect_owner_columns tanpa 'stock_activated')
-- ============================================================
