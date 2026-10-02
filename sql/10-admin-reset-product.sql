-- ============================================================
-- 10-admin-reset-product.sql
-- Definisi fungsi admin_reset_product SEBAGAIMANA ADA di database
-- produksi (diekspor dengan pg_get_functiondef), supaya tercatat di
-- repo. Dipakai tombol "Reset & lepas" di panel admin master.
--
-- Fungsi ini sengaja HANYA mengosongkan data identitas toko. Hal-hal
-- lain dilengkapi di sisi aplikasi (app/admin/master/actions.ts ->
-- resetAndUnbind), karena butuh akses Cloudinary dan Auth Admin API
-- yang tidak bisa dilakukan dari SQL:
--   - hapus file Cloudinary/Storage toko lama (logo, cover, ikon,
--     foto keluhan)
--   - hapus keluhan, scan_logs, positive_clicks milik kartu
--   - kosongkan cover, ikon sosial, warna brand, last_scanned_at
--   - hapus akun login owner lama (kalau tidak punya toko lain)
-- PIN aktivasi (pin_hash) dan plan (basic/pro) sengaja TIDAK diubah:
-- kartu fisik yang sama dijual ulang dengan PIN yang sama.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_reset_product(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not is_super_admin() then
    raise exception 'Akses ditolak: hanya Super Admin.';
  end if;

  update products
  set business_name = null,
      google_review_url = null,
      owner_whatsapp = null,
      owner_id = null,
      logo_url = null,
      pending_review = false,
      is_active = false,
      is_suspended = false
  where id = p_product_id;

  insert into admin_actions (actor_id, product_id, action, detail)
  values (
    auth.uid(),
    p_product_id,
    'reset_unbind',
    jsonb_build_object('note', 'Data toko dikosongkan, kartu siap dijual ulang')
  );
end;
$function$;
