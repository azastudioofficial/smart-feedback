-- ============================================================
-- FIX: verify_activation_pin tidak menemukan crypt()/gen_salt()
-- Jalankan di Supabase SQL Editor
-- ============================================================
-- Penyebab: pgcrypto biasanya ter-install di schema "extensions",
-- sementara function sebelumnya di-set search_path = public saja,
-- jadi crypt() jadi tidak "terlihat". Perbaikannya: tambahkan
-- schema extensions ke search_path function ini.

create or replace function verify_activation_pin(
  p_product_id uuid,
  p_input_pin text
)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from products
    where id = p_product_id
    and pin_hash = crypt(p_input_pin, pin_hash)
    and is_active = false
    and is_suspended = false
  );
$$;

revoke all on function verify_activation_pin(uuid, text) from public;
grant execute on function verify_activation_pin(uuid, text)
  to anon, authenticated, service_role;
