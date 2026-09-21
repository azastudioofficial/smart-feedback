"use server";
// app/activate/[id]/actions.ts

import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

type ActivateInput = {
  businessName: string;
  googleReviewUrl: string;
  ownerWhatsapp: string;
  email: string;
  password: string;
  agreedToTerms: boolean;
};

type ActivateResult = { success: boolean; error?: string };

export async function activateProduct(
  productId: string,
  formData: ActivateInput
): Promise<ActivateResult> {
  const service = createServiceClient();

  // Cek dulu status kartu - jangan terima submit dobel untuk kartu
  // yang sudah aktif/lagi menunggu approval/ditangguhkan.
  const { data: existing, error: fetchError } = await service
    .from("products")
    .select("is_active, is_suspended, pending_review")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { success: false, error: "Kartu tidak ditemukan." };
  }

  if (existing.is_suspended) {
    return { success: false, error: "Kartu ini sedang ditangguhkan." };
  }
  if (existing.is_active) {
    return { success: false, error: "Kartu ini sudah aktif sebelumnya." };
  }
  if (existing.pending_review) {
    return {
      success: false,
      error: "Permohonan aktivasi kartu ini sudah dikirim, sedang menunggu persetujuan.",
    };
  }

  // Wajib setuju Syarat & Ketentuan sebelum lanjut - dicek di server,
  // bukan cuma di form (form bisa dimanipulasi orang iseng).
  if (!formData.agreedToTerms) {
    return {
      success: false,
      error: "Anda harus menyetujui Syarat & Ketentuan Layanan.",
    };
  }

  const auth = await createServerSupabase();

  const { data: signUpData, error: signUpError } = await auth.auth.signUp({
    email: formData.email,
    password: formData.password,
  });

  // KEBIJAKAN: 1 email = 1 toko. Email yang sudah pernah dipakai
  // aktivasi TIDAK BOLEH dipakai lagi untuk toko lain - apapun
  // alasannya, termasuk kalau password-nya kebetulan benar. Ini
  // sengaja diperketat (dulu email lama boleh dipakai ulang untuk
  // toko ke-2, ke-3, dst) supaya 1 akun dashboard = 1 toko, jelas
  // dan tidak membingungkan owner yang punya banyak kartu.
  if (signUpError) {
    return {
      success: false,
      error:
        "Email ini sudah pernah digunakan untuk mengaktifkan toko lain. Satu email hanya bisa dipakai untuk satu toko - gunakan email lain, atau hubungi admin kalau kartu ini seharusnya masuk ke toko yang sama.",
    };
  }

  const userId = signUpData.user?.id ?? null;

  if (!userId) {
    return { success: false, error: "Gagal membuat akun. Coba lagi." };
  }

  // Simpan data toko + hubungkan ke owner, TAPI belum langsung aktif -
  // status jadi "menunggu persetujuan" reseller/admin yang punya kartu ini.
  const { error: updateError } = await service
    .from("products")
    .update({
      business_name: formData.businessName,
      google_review_url: formData.googleReviewUrl,
      owner_whatsapp: formData.ownerWhatsapp,
      owner_id: userId,
      pending_review: true,
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (updateError) {
    console.error("Gagal update produk saat aktivasi:", updateError.message);
    // Akun auth sudah terlanjur dibuat tapi produk gagal disimpan -
    // hapus lagi akunnya supaya emailnya tidak "terjebak" ke akun
    // kosong yang tidak terhubung ke toko manapun.
    await service.auth.admin.deleteUser(userId).catch(() => {});
    return { success: false, error: "Gagal menyimpan data toko. Coba lagi." };
  }

  return { success: true };
}
