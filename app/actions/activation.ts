"use server";
// app/actions/activation.ts
// Dipakai oleh /admin/master (Super Admin) DAN /reseller (Reseller).
// Karena pakai client yang IKUT SESI LOGIN (bukan service client),
// RLS "owner_update_own_product" otomatis membatasi: reseller cuma
// bisa approve/reject kartu yang reseller_id-nya = akun dia sendiri,
// sementara Super Admin bisa untuk semua kartu. Tidak perlu
// pengecekan manual tambahan di sini - keamanannya di level database.

import { revalidatePath } from "next/cache";
import {
  createServerSupabase,
  createServiceClient,
} from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guards";

type ActionResult = { success: boolean; error?: string };

const NOT_PENDING_ERROR = "Permohonan tidak ditemukan atau sudah diproses.";

/**
 * Hapus akun login owner yang permohonannya ditolak, supaya emailnya bisa
 * dipakai mendaftar lagi (kebijakan 1 email = 1 toko). Pola yang sama
 * dengan resetAndUnbind/deleteProduct di app/admin/master/actions.ts.
 * Sengaja berhati-hati - kalau ragu, akun DIBIARKAN (tidak dihapus):
 * - owner masih terhubung ke toko lain -> jangan hapus
 * - akun punya role staf (super_admin/reseller) -> jangan hapus
 * - gagal membaca data -> jangan hapus
 */
async function removeRejectedOwnerAccount(ownerId: string): Promise<void> {
  const service = createServiceClient();

  const { count, error: countError } = await service
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (countError || (count ?? 0) > 0) return;

  const { data: found, error: userError } =
    await service.auth.admin.getUserById(ownerId);
  if (userError || !found?.user) return;
  if (found.user.app_metadata?.role) return;

  const { error: deleteError } = await service.auth.admin.deleteUser(ownerId);
  if (deleteError) {
    console.error(
      "Aktivasi ditolak, tapi gagal menghapus akun login owner:",
      deleteError.message
    );
  }
}

export async function approveActivation(
  productId: string
): Promise<ActionResult> {
  // Hanya Super Admin / Reseller. Owner toko TIDAK boleh menyetujui
  // aktivasinya sendiri (dikunci juga di database, lihat
  // sql/11-security-hardening.sql).
  const guard = await requireRole(["super_admin", "reseller"]);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createServerSupabase();

  // .eq("pending_review", true): hanya permohonan yang memang sedang
  // menunggu yang bisa disetujui (bukan kartu kosong / yang sudah diproses).
  const { data: approved, error } = await supabase
    .from("products")
    .update({ is_active: true, pending_review: false })
    .eq("id", productId)
    .eq("pending_review", true)
    .select("id");

  if (error) {
    console.error("Gagal approve aktivasi:", error.message);
    return { success: false, error: "Gagal menyetujui aktivasi." };
  }
  if (!approved || approved.length === 0) {
    return { success: false, error: NOT_PENDING_ERROR };
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true };
}

export async function rejectActivation(
  productId: string
): Promise<ActionResult> {
  const guard = await requireRole(["super_admin", "reseller"]);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createServerSupabase();

  // Ambil owner_id LAMA sebelum dikosongkan (RLS: reseller hanya melihat
  // kartunya sendiri). Sekaligus memastikan permohonannya memang masih
  // menunggu - tombol Tolak tidak boleh mengosongkan kartu yang sudah aktif.
  const { data: current, error: readError } = await supabase
    .from("products")
    .select("owner_id, pending_review")
    .eq("id", productId)
    .maybeSingle();

  if (readError) {
    console.error("Gagal membaca permohonan:", readError.message);
    return { success: false, error: "Gagal menolak aktivasi." };
  }
  if (!current || !current.pending_review) {
    return { success: false, error: NOT_PENDING_ERROR };
  }
  const ownerId = (current.owner_id as string | null) ?? null;

  const { data: rejected, error } = await supabase
    .from("products")
    .update({
      business_name: null,
      google_review_url: null,
      owner_whatsapp: null,
      owner_id: null,
      logo_url: null,
      pending_review: false,
      is_active: false,
    })
    .eq("id", productId)
    .eq("pending_review", true)
    .select("id");

  if (error) {
    console.error("Gagal reject aktivasi:", error.message);
    return { success: false, error: "Gagal menolak aktivasi." };
  }
  if (!rejected || rejected.length === 0) {
    return { success: false, error: NOT_PENDING_ERROR };
  }

  // Bebaskan email owner yang ditolak (best-effort, tidak menggagalkan
  // penolakan kalau langkah ini bermasalah).
  if (ownerId) {
    await removeRejectedOwnerAccount(ownerId);
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true };
}
