"use server";
// app/actions/activation.ts
// Dipakai oleh /admin/master (Super Admin) DAN /reseller (Reseller).
// Karena pakai client yang IKUT SESI LOGIN (bukan service client),
// RLS "owner_update_own_product" otomatis membatasi: reseller cuma
// bisa approve/reject kartu yang reseller_id-nya = akun dia sendiri,
// sementara Super Admin bisa untuk semua kartu. Tidak perlu
// pengecekan manual tambahan di sini - keamanannya di level database.

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

type ActionResult = { success: boolean; error?: string };

export async function approveActivation(
  productId: string
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("products")
    .update({ is_active: true, pending_review: false })
    .eq("id", productId);

  if (error) {
    console.error("Gagal approve aktivasi:", error.message);
    return { success: false, error: "Gagal menyetujui aktivasi." };
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true };
}

export async function rejectActivation(
  productId: string
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  const { error } = await supabase
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
    .eq("id", productId);

  if (error) {
    console.error("Gagal reject aktivasi:", error.message);
    return { success: false, error: "Gagal menolak aktivasi." };
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true };
}
