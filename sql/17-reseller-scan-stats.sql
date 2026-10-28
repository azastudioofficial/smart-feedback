-- ============================================================
-- STATISTIK SCAN RESELLER: agregasi di database.
-- Jalankan SEKALI di Supabase SQL Editor - SEBELUM deploy kodenya.
-- ============================================================
-- Masalah sebelumnya (app/reseller/page.tsx):
--   1) Tabel scan_logs hanya punya policy SELECT untuk owner & super
--      admin. Query dengan akun reseller tidak melihat baris apa pun,
--      jadi "Total Scan" bisa selalu 0.
--   2) Kalaupun terbaca, semua baris ditarik ke server lalu dihitung
--      di JavaScript. PostgREST membatasi ~1000 baris per query, jadi
--      angkanya terpotong dan makin tidak akurat saat data bertambah.
--
-- Hasil fungsi = JSON kecil, ukurannya tetap:
--   { "total": <jumlah scan semua kartu reseller>,
--     "per_product": { "<product_id>": <jumlah>, ... } }
-- per_product hanya berisi id yang diminta (kartu yang ditampilkan
-- di tabel), supaya hasilnya tidak ikut membesar.
-- Catatan: scan_logs dibersihkan cron setelah 90 hari, jadi angkanya
-- = scan 90 hari terakhir.

create index if not exists idx_scan_logs_product_id
  on scan_logs (product_id);

create or replace function reseller_scan_stats(
  p_reseller_id uuid,
  p_product_ids uuid[] default '{}'
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'total',
    coalesce((
      select count(*)::int
      from scan_logs l
      join products p on p.id = l.product_id
      where p.reseller_id = p_reseller_id
    ), 0),
    'per_product',
    coalesce((
      select jsonb_object_agg(x.product_id, x.n)
      from (
        select l.product_id, count(*)::int as n
        from scan_logs l
        join products p on p.id = l.product_id
        where p.reseller_id = p_reseller_id
          and l.product_id = any(p_product_ids)
        group by l.product_id
      ) x
    ), '{}'::jsonb)
  );
$$;

-- Keamanan: fungsi menerima reseller_id apa saja, jadi HANYA boleh
-- dipanggil dari server (service_role). Server mengisi p_reseller_id
-- dari user.id yang sudah diverifikasi role-nya - bukan dari input
-- pengguna. Pola yang sama dengan owner_analytics().
revoke all on function reseller_scan_stats(uuid, uuid[]) from public, anon, authenticated;
grant execute on function reseller_scan_stats(uuid, uuid[]) to service_role;

-- ------------------------------------------------------------
-- product_scan_counts: jumlah scan per kartu untuk SEKUMPULAN id.
-- Dipakai tabel inventori (admin & reseller) saat pindah halaman,
-- supaya kolom "Scan" di halaman 2, 3, dst tidak tampil 0.
-- Server hanya mengirim id yang barusan dibaca lewat query products
-- milik si pemanggil (sudah dibatasi RLS), jadi reseller tidak bisa
-- meminta hitungan kartu orang lain.
-- ------------------------------------------------------------
create or replace function product_scan_counts(p_product_ids uuid[])
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.product_id, x.n), '{}'::jsonb)
  from (
    select l.product_id, count(*)::int as n
    from scan_logs l
    where l.product_id = any(p_product_ids)
    group by l.product_id
  ) x;
$$;

revoke all on function product_scan_counts(uuid[]) from public, anon, authenticated;
grant execute on function product_scan_counts(uuid[]) to service_role;

-- Cek hasil (ganti dengan id reseller asli):
-- select reseller_scan_stats('00000000-0000-0000-0000-000000000000');
-- select product_scan_counts(array['00000000-0000-0000-0000-000000000000']::uuid[]);
