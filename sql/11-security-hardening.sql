-- ============================================================
-- 11-security-hardening.sql
-- Penutupan celah keamanan hasil audit V15.
-- Jalankan di Supabase SQL Editor. AMAN dijalankan berulang kali
-- dan tidak mengubah/menghapus data apa pun.
--
-- LANGKAH 0 (opsional, disarankan): lihat dulu policy yang sekarang
-- ada di database produksi - namanya bisa berbeda dari 1-schema.sql
-- karena dulu ada perubahan manual:
--
--   select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname in ('public', 'storage')
--   order by tablename, policyname;
-- ============================================================


-- ------------------------------------------------------------
-- 1. Kunci kolom "kontrol" di tabel products untuk OWNER
-- ------------------------------------------------------------
-- Masalah: policy owner_update_own_product mengizinkan owner mengubah
-- KOLOM APA SAJA di kartunya sendiri, dan anon key Supabase itu publik.
-- Owner bisa menyetujui aktivasinya sendiri (is_active=true), mencabut
-- penangguhan (is_suspended=false), atau mengganti short_code/reseller_id.
-- (Sebelumnya hanya kolom "plan" yang dikunci.)
--
-- Aturan: kalau yang mengubah adalah user login biasa (owner) -> kolom
-- di bawah TIDAK boleh berubah. Lolos tanpa batas untuk:
--   - service role / SQL Editor / cron      (auth.uid() = null)
--   - Super Admin dan Reseller              (role di app_metadata)
create or replace function protect_owner_columns()
returns trigger
language plpgsql
as $$
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
    'pin_hash', 'terms_accepted_at', 'created_at'
  ]
  loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception 'Kolom % hanya boleh diubah oleh admin/reseller.', v_col;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_protect_owner_columns on products;
create trigger trg_protect_owner_columns
before update on products
for each row execute function protect_owner_columns();


-- ------------------------------------------------------------
-- 2. Owner hanya boleh mengubah STATUS pada keluhan
-- ------------------------------------------------------------
-- Policy owner_update_own_feedbacks mengizinkan update kolom apa saja
-- (isi keluhan, foto, bahkan product_id). Aplikasi hanya butuh status.
create or replace function protect_feedback_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or is_super_admin() then
    return new;
  end if;

  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Hanya status keluhan yang boleh diubah.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_feedback_columns on feedbacks;
create trigger trg_protect_feedback_columns
before update on feedbacks
for each row execute function protect_feedback_columns();


-- ------------------------------------------------------------
-- 3. Tutup jalan pintas INSERT langsung lewat API publik
-- ------------------------------------------------------------
-- Aplikasi memasukkan scan_logs / feedbacks / positive_clicks lewat
-- server (service role), yang sudah memvalidasi toko aktif, paket Pro,
-- panjang teks, dan rate limit. Policy "with check (true)" di bawah
-- membiarkan siapa pun yang punya anon key (publik) menembak tabel
-- langsung dan MELEWATI semua validasi itu - mis. membanjiri keluhan
-- ke toko mana pun.
drop policy if exists "public_insert_scan_log" on scan_logs;
drop policy if exists "public_insert_feedback" on feedbacks;
drop policy if exists "public_insert_positive_click" on positive_clicks;

-- Upload foto keluhan sudah pindah ke Cloudinary; bucket Storage lama
-- tidak perlu lagi menerima upload anonim.
drop policy if exists "public_insert_complaint_photo" on storage.objects;


-- ------------------------------------------------------------
-- 4. View products_public membocorkan nomor WhatsApp semua toko
-- ------------------------------------------------------------
-- View ini di-grant ke anon dan berisi owner_whatsapp + google_review_url
-- seluruh toko, sedangkan kode aplikasi tidak memakainya sama sekali.
drop view if exists public.products_public;


-- ------------------------------------------------------------
-- 5. Cek manual setelah menjalankan file ini
-- ------------------------------------------------------------
-- a) Fungsi admin_* harus mengecek role di DALAM fungsinya dan tidak
--    boleh bisa dipanggil anon. Lihat siapa yang boleh menjalankannya:
--
--   select p.proname, p.prosecdef as security_definer,
--          has_function_privilege('anon', p.oid, 'execute') as anon_boleh
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like 'admin\_%';
--
--    Kalau anon_boleh = true untuk fungsi yang security_definer,
--    pastikan isinya diawali "if not is_super_admin() then raise ...",
--    atau cabut aksesnya: revoke execute on function <nama>(<args>) from anon;
--
-- b) Pastikan tabel resellers punya RLS aktif:
--   select relname, relrowsecurity from pg_class
--   where relname in ('resellers','products','feedbacks','scan_logs',
--                     'positive_clicks','activation_attempts','admin_actions');
