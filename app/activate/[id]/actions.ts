"use server";
// app/activate/[id]/actions.ts

import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { safeHttpUrl } from "@/lib/safe-url";
import { checkRateLimit } from "@/lib/rate-limit";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ActivateInput = {
  businessName: string;
  googleReviewUrl: string;
  ownerWhatsapp: string;
  email: string;
  password: string;
  agreedToTerms: boolean;
};

type ActivateResult = {
  success: boolean;
  error?: string;
  /**
   * true = kartu ini "stok aktif" (sudah disetujui di muka oleh admin/
   * reseller), jadi langsung aktif tanpa menunggu persetujuan.
   */
  autoApproved?: boolean;
};

/**
 * Apakah kartu ini sudah diberi tanda "stok aktif" oleh admin/reseller?
 * Dibaca terpisah & gagal-aman: kalau kolomnya belum ada (SQL 14 belum
 * dijalankan) atau query gagal, dianggap BELUM aktif -> alur lama
 * (menunggu persetujuan) tetap jalan seperti biasa.
 */
async function isStockActivated(
  service: ReturnType<typeof createServiceClient>,
  productId: string
): Promise<boolean> {
  const { data, error } = await service
    .from("products")
    .select("stock_activated")
    .eq("id", productId)
    .maybeSingle();
  if (error) {
    console.error("Gagal cek stok aktif:", error.message);
    return false;
  }
  return data?.stock_activated === true;
}

export async function activateProduct(
  productId: string,
  formData: ActivateInput
): Promise<ActivateResult> {
  if (!UUID_REGEX.test(productId)) {
    return { success: false, error: "Kartu tidak ditemukan." };
  }

  // Batas per IP (Cloudflare Rate Limiting, lihat wrangler.jsonc).
  if (!(await checkRateLimit("ACTIVATE_LIMITER", "activate"))) {
    return {
      success: false,
      error: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
    };
  }

  // Validasi & rapikan input di SERVER (form di browser bisa dilewati).
  const businessName = (formData.businessName ?? "").trim();
  const ownerWhatsapp = (formData.ownerWhatsapp ?? "").trim();
  const email = (formData.email ?? "").trim().toLowerCase();
  const reviewUrl = safeHttpUrl(formData.googleReviewUrl);

  if (!businessName || businessName.length > 120) {
    return { success: false, error: "Nama toko wajib diisi (maksimal 120 karakter)." };
  }
  if (!reviewUrl) {
    return {
      success: false,
      error: "Link Google Review tidak valid (harus diawali http:// atau https://).",
    };
  }
  // WhatsApp hanya wajib untuk paket Pro (form mengosongkannya di Basic),
  // jadi boleh kosong - tapi kalau diisi harus berupa nomor telepon.
  if (ownerWhatsapp && !/^[0-9+\-\s()]{6,30}$/.test(ownerWhatsapp)) {
    return { success: false, error: "Nomor WhatsApp tidak valid." };
  }
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    return { success: false, error: "Format email tidak valid." };
  }
  if (typeof formData.password !== "string" || formData.password.length < 6 || formData.password.length > 72) {
    return { success: false, error: "Password harus 6-72 karakter." };
  }

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
    email,
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

  const shopData = {
    business_name: businessName,
    google_review_url: reviewUrl,
    owner_whatsapp: ownerWhatsapp,
    owner_id: userId,
    terms_accepted_at: new Date().toISOString(),
  };

  // JALUR 1 - kartu "stok aktif": sudah disetujui di muka oleh admin/
  // reseller, jadi langsung aktif tanpa menunggu persetujuan. Tanda
  // stok aktif dipakai habis (dikembalikan ke false) di update yang sama.
  // Filter .eq(...) di bawah membuat update ini atomik: kalau kartu
  // keburu diambil orang lain, atau tandanya baru saja dicabut, tidak ada
  // baris yang berubah dan kita jatuh ke jalur 2.
  let autoApproved = false;
  if (await isStockActivated(service, productId)) {
    const { data: approvedRows, error: approveError } = await service
      .from("products")
      .update({
        ...shopData,
        is_active: true,
        pending_review: false,
        stock_activated: false,
      })
      .eq("id", productId)
      .eq("is_active", false)
      .eq("pending_review", false)
      .eq("stock_activated", true)
      .select("id");

    if (approveError) {
      console.error("Gagal aktivasi otomatis:", approveError.message);
    } else {
      autoApproved = (approvedRows?.length ?? 0) > 0;
    }
  }

  if (autoApproved) {
    return { success: true, autoApproved: true };
  }

  // JALUR 2 - alur biasa: simpan data toko + hubungkan ke owner, TAPI
  // belum langsung aktif - status jadi "menunggu persetujuan"
  // reseller/admin yang punya kartu ini.
  const { data: savedRows, error: updateError } = await service
    .from("products")
    .update({ ...shopData, pending_review: true })
    .eq("id", productId)
    .eq("is_active", false)
    .eq("pending_review", false)
    .select("id");

  if (updateError || !savedRows || savedRows.length === 0) {
    if (updateError) {
      console.error("Gagal update produk saat aktivasi:", updateError.message);
    }
    // Akun auth sudah terlanjur dibuat tapi produk gagal disimpan (atau
    // kartunya keburu diambil permohonan lain) - hapus lagi akunnya
    // supaya emailnya tidak "terjebak" ke akun kosong yang tidak
    // terhubung ke toko manapun.
    await service.auth.admin.deleteUser(userId).catch(() => {});
    return {
      success: false,
      error: updateError
        ? "Gagal menyimpan data toko. Coba lagi."
        : "Kartu ini baru saja diaktivasi oleh pengguna lain.",
    };
  }

  return { success: true };
}

// Dipakai halaman "menunggu persetujuan" untuk polling - biar begitu
// admin/reseller meng-ACC aktivasi, browser pelanggan/owner yang
// masih terbuka di halaman itu otomatis pindah ke halaman feedback
// sendiri, tanpa perlu scan ulang QR atau refresh manual.
export async function checkActivationStatus(
  productId: string
): Promise<{ isActive: boolean; isSuspended: boolean }> {
  const service = createServiceClient();

  const { data } = await service
    .from("products")
    .select("is_active, is_suspended")
    .eq("id", productId)
    .maybeSingle();

  return {
    isActive: data?.is_active ?? false,
    isSuspended: data?.is_suspended ?? false,
  };
}
