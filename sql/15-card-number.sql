-- ============================================================
-- 15-card-number.sql
-- Nomor kartu INTERNAL: AZA20001, AZA20002, ... (urut, mulai 20001).
--
-- Hanya label untuk admin/reseller/pembeli. Kode acak di QR
-- (products.short_code) TIDAK diubah dan tetap satu-satunya yang
-- membuka kartu. Nomor ini tidak dipakai di alamat (URL) apa pun.
--
-- Yang disimpan di database hanya angkanya (kolom card_seq, mis. 20001);
-- awalan "AZA" ditambahkan oleh aplikasi (lib/card-number.ts).
--
-- URUTAN PENTING: jalankan file ini LEBIH DULU, baru commit kode baru
-- ke GitHub. (Kode baru membaca kolom card_seq; kalau belum ada, tabel
-- kartu di dasbor gagal dimuat.)
--
-- AMAN: hanya MENAMBAH kolom + sequence. Tidak ada data yang diubah atau
-- dihapus; short_code, QR, dan semua kartu yang ada tetap sama.
-- Aman dijalankan berulang kali.
-- ============================================================

-- ------------------------------------------------------------
-- LANGKAH 1 - Sequence (mulai 20001) dan kolom
-- ------------------------------------------------------------
create sequence if not exists public.products_card_seq
  start with 20001 minvalue 1;

alter table public.products
  add column if not exists card_seq bigint;

-- ------------------------------------------------------------
-- LANGKAH 2 - Beri nomor kartu yang sudah ada
-- Urutan: menurut waktu dibuat (created_at), lalu id. Yang pertama
-- dibuat mendapat 20001. Hanya baris yang belum bernomor yang diisi,
-- dan nomor tidak pernah dipakai ulang.
-- ------------------------------------------------------------
with base as (
  select coalesce(max(card_seq), 20000) as m from public.products
),
ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.products
  where card_seq is null
)
update public.products p
set card_seq = base.m + ordered.rn
from ordered, base
where p.id = ordered.id;

-- Sinkronkan sequence supaya kartu BARU melanjutkan dari nomor terbesar.
-- (Tidak pernah memundurkan sequence, jadi nomor kartu yang sudah
-- dihapus tidak dipakai lagi.)
do $$
declare
  m bigint;
  issued bigint;
begin
  select max(card_seq) into m from public.products;
  select case when is_called then last_value else last_value - 1 end
    into issued
    from public.products_card_seq;
  if m is not null and m >= issued then
    perform setval('public.products_card_seq', m, true);
  end if;
end
$$;

-- ------------------------------------------------------------
-- LANGKAH 3 - Kartu baru otomatis dapat nomor berikutnya
-- (fungsi admin_generate_products tidak perlu diubah)
-- ------------------------------------------------------------
alter table public.products
  alter column card_seq set default nextval('public.products_card_seq');

alter sequence public.products_card_seq owned by public.products.card_seq;

alter table public.products
  alter column card_seq set not null;

create unique index if not exists products_card_seq_key
  on public.products (card_seq);

-- Supaya proses pembuatan kartu (peran authenticated / service_role)
-- boleh mengambil nomor berikutnya.
grant usage, select on sequence public.products_card_seq
  to authenticated, service_role;

-- ------------------------------------------------------------
-- LANGKAH 4 - Kunci kolom dari owner (disarankan)
-- ------------------------------------------------------------
-- Tanpa ini, owner yang login bisa mengubah nomor kartunya sendiri lewat
-- API Supabase. Ini fungsi protect_owner_columns yang SUDAH ADA di produksi,
-- dengan dua tambahan di daftar kolom: 'stock_activated' (dari file 14) dan
-- 'card_seq'. Logika lainnya tidak diubah. Aman walau file 14 belum
-- dijalankan, dan menggantikan versi dari file 14.
--
-- Sebelum menjalankan, bandingkan dengan yang ada sekarang:
--   select pg_get_functiondef('public.protect_owner_columns()'::regprocedure);
-- Kalau berbeda dari versi di bawah (selain baris tambahan), JANGAN jalankan
-- langkah 4 - kirim hasilnya dulu untuk dicek.
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
    'stock_activated', 'card_seq'
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
--   select card_seq, short_code, created_at from public.products
--    order by card_seq limit 5;
--   -- nomor pertama 20001, urut menurut waktu dibuat
--
--   select count(*) total, count(card_seq) bernomor, min(card_seq), max(card_seq)
--     from public.products;
--   -- total = bernomor
--
-- Batalkan (kalau perlu) - kode lama tidak membaca kolom ini:
--   alter table public.products drop column if exists card_seq;
--   drop sequence if exists public.products_card_seq;
--   (lalu kembalikan fungsi protect_owner_columns tanpa 'card_seq')
-- ============================================================
