-- ============================================================
-- 13-url-safety.sql
-- Pagar terakhir di DATABASE: tolak URL yang bukan http/https di
--   - products.google_review_url
--   - products.social_links (kolom "url" tiap tautan)
-- Tujuannya menutup jalur tulis langsung lewat API Supabase yang
-- melewati validasi aplikasi (safeHttpUrl di server action).
--
-- AMAN dijalankan di produksi:
--   * TIDAK mengubah / menghapus data apa pun.
--   * Constraint hanya dipasang kalau SEMUA baris yang sudah ada
--     lolos. Kalau ada yang tidak lolos, pemasangan dilewati,
--     muncul NOTICE, dan baris bermasalah tampil di langkah A
--     untuk diperbaiki dulu. Jalankan ulang file ini setelahnya.
--   * Aman dijalankan berulang kali.
--   * Semua jalur tulis aplikasi (aktivasi, pengaturan owner,
--     override admin, reset kartu) sudah menghasilkan nilai yang
--     lolos aturan ini, jadi alur yang berjalan tidak terganggu.
--
-- Urutan: jalankan seluruh file sekaligus di Supabase SQL Editor.
-- ============================================================

-- Fungsi pembantu (CHECK tidak boleh berisi subquery, jadi dibungkus).
-- IMMUTABLE & hanya membaca argumennya sendiri.
create or replace function public.social_links_are_safe(j jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when j is null then true
    when jsonb_typeof(j) <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(j) e
      where coalesce(e ->> 'url', '') !~* '^https?://'
    )
  end
$$;

-- ------------------------------------------------------------
-- A. PENGECEKAN (hanya membaca). Hasil yang BAIK = kedua tabel
--    di bawah kosong (0 baris).
-- ------------------------------------------------------------
select id, short_code, google_review_url
from products
where google_review_url is not null
  and google_review_url <> ''
  and google_review_url !~* '^https?://';

select id, short_code, social_links
from products
where not public.social_links_are_safe(social_links);

-- ------------------------------------------------------------
-- B. PASANG CONSTRAINT (hanya kalau data yang ada sudah bersih)
-- ------------------------------------------------------------
do $$
begin
  -- google_review_url
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_google_review_url_http'
      and conrelid = 'public.products'::regclass
  ) then
    if exists (
      select 1 from products
      where google_review_url is not null
        and google_review_url <> ''
        and google_review_url !~* '^https?://'
    ) then
      raise notice 'DILEWATI: ada google_review_url non-http(s). Perbaiki dulu (lihat langkah A), lalu jalankan ulang.';
    else
      alter table products
        add constraint products_google_review_url_http
        check (
          google_review_url is null
          or google_review_url = ''
          or google_review_url ~* '^https?://'
        );
      raise notice 'Constraint products_google_review_url_http terpasang.';
    end if;
  end if;

  -- social_links
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_social_links_http'
      and conrelid = 'public.products'::regclass
  ) then
    if exists (
      select 1 from products where not public.social_links_are_safe(social_links)
    ) then
      raise notice 'DILEWATI: ada social_links dengan URL non-http(s). Perbaiki dulu (lihat langkah A), lalu jalankan ulang.';
    else
      alter table products
        add constraint products_social_links_http
        check (public.social_links_are_safe(social_links));
      raise notice 'Constraint products_social_links_http terpasang.';
    end if;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Cek hasil (harus menampilkan 2 baris kalau keduanya terpasang):
-- select conname from pg_constraint
--  where conrelid = 'public.products'::regclass
--    and conname in ('products_google_review_url_http','products_social_links_http');
--
-- Batalkan kalau perlu:
-- alter table products drop constraint if exists products_google_review_url_http;
-- alter table products drop constraint if exists products_social_links_http;
-- ============================================================
