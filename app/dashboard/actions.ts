"use server";
// app/dashboard/actions.ts

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { extractCloudinaryPublicId } from "@/lib/utils";
import { sanitizeSocialLinks, type SocialLink } from "@/lib/social-links";
import { isAllowedCloudinaryUrl, safeHttpUrl } from "@/lib/safe-url";
import { CARD_TITLE_MAX, CARD_DESCRIPTION_MAX } from "@/lib/feedback-cards";

type ActionResult = { success: boolean; error?: string };

/**
 * Hapus 1 file ikon custom (tautan Connect with Us) dari Cloudinary.
 * Dipanggil best-effort saat owner ganti/hapus ikon custom - TIDAK
 * menyentuh kolom social_links di database (itu tetap disimpan lewat
 * updateSettings seperti biasa), cuma bersihkan file lamanya di
 * Cloudinary supaya tidak menumpuk file yatim.
 */
export async function removeSocialIcon(iconUrl: string): Promise<ActionResult> {
  // WAJIB login + ikon harus memang milik toko si pemanggil. Tanpa ini,
  // siapa pun bisa memanggil action ini dengan URL Cloudinary milik toko
  // lain (URL-nya terlihat publik di halaman feedback) dan menghapusnya.
  if (!isAllowedCloudinaryUrl(iconUrl)) {
    return { success: true };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Silakan login ulang." };
  }

  // RLS: owner hanya melihat tokonya sendiri (super admin melihat semua).
  const { data: rows } = await supabase
    .from("products")
    .select("social_links");

  const isOwnIcon = (rows ?? []).some((row) =>
    Array.isArray(row.social_links) &&
    (row.social_links as Array<{ icon_url?: string | null }>).some(
      (l) => l?.icon_url === iconUrl
    )
  );

  // Ikon yang belum pernah tersimpan (baru diupload lalu dibatalkan)
  // tidak bisa dibuktikan miliknya siapa - dibiarkan, bukan dihapus.
  if (!isOwnIcon) {
    return { success: true };
  }

  const publicId = extractCloudinaryPublicId(iconUrl);
  if (publicId) {
    try {
      await deleteCloudinaryImage(publicId);
    } catch (err) {
      console.error("Gagal hapus ikon custom dari Cloudinary:", err);
      // Tidak fatal - owner tetap bisa lanjut ganti/hapus ikonnya.
    }
  }

  return { success: true };
}

/**
 * Hapus 1 foto dari Cloudinary lewat Admin API (butuh API Key+Secret,
 * beda dari upload yang unsigned dari browser).
 */
async function deleteCloudinaryImage(publicId: string): Promise<void> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return;

  const auth = btoa(`${apiKey}:${apiSecret}`);
  await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?public_ids[]=${encodeURIComponent(
      publicId
    )}`,
    { method: "DELETE", headers: { Authorization: `Basic ${auth}` } }
  );
}

/** Daftar icon_url (tidak kosong) dari isi kolom social_links. */
function iconUrlsOf(links: unknown): string[] {
  if (!Array.isArray(links)) return [];
  return links
    .map((l) => (l as { icon_url?: string | null } | null)?.icon_url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

/**
 * true = ikon ini masih dipakai toko LAIN (atau pengecekan gagal) - jangan
 * dihapus dari Cloudinary. Gagal-aman: kalau ragu, file dibiarkan.
 */
async function iconUsedByOtherStore(
  url: string,
  productId: string
): Promise<boolean> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("products")
    .select("id")
    .contains("social_links", [{ icon_url: url }])
    .neq("id", productId)
    .limit(1);
  if (error) {
    console.error("Gagal cek pemakaian ikon:", error.message);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * true = URL ikon kartu ini masih dipakai toko LAIN (atau pengecekan gagal)
 * - jangan dihapus dari Cloudinary. Gagal-aman: kalau ragu, file dibiarkan.
 */
async function cardIconUsedElsewhere(
  url: string,
  productId: string
): Promise<boolean> {
  const service = createServiceClient();
  for (const column of ["review_card_icon_url", "complaint_card_icon_url"]) {
    const { data, error } = await service
      .from("products")
      .select("id")
      .eq(column, url)
      .neq("id", productId)
      .limit(1);
    if (error) {
      console.error("Gagal cek pemakaian ikon kartu:", error.message);
      return true;
    }
    if ((data?.length ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Update pengaturan toko. Pakai client yang IKUT SESI LOGIN (bukan
 * service client) supaya RLS "owner_update_own_product" yang menentukan
 * boleh/tidaknya update - bukan kita yang cek manual di sini.
 */
export async function updateSettings(
  productId: string,
  data: {
    businessName: string;
    googleReviewUrl: string;
    ownerWhatsapp: string;
    logoUrl?: string;
    coverImageUrl?: string;
    coverPosition?: string;
    brandColor?: string;
    socialLinks?: SocialLink[];
    connectTitle?: string;
    connectDescription?: string;
    // Kustomisasi dua kartu pilihan di halaman feedback (Pro).
    // undefined = jangan diubah; string kosong = kembali ke bawaan.
    reviewCardTitle?: string;
    reviewCardDescription?: string;
    reviewCardIconUrl?: string;
    complaintCardTitle?: string;
    complaintCardDescription?: string;
    complaintCardIconUrl?: string;
  }
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  // Ambil plan lewat client sesi login. RLS memastikan owner hanya bisa
  // membaca produknya sendiri. Entitlement Basic/Pro diputuskan ulang
  // di SERVER supaya tidak bergantung pada field yang disembunyikan UI.
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("plan")
    .eq("id", productId)
    .maybeSingle();

  if (productError || !product) {
    return { success: false, error: "Toko tidak ditemukan atau akses ditolak." };
  }

  const isPro = product.plan === "pro";

  // Validasi field yang memang tersedia untuk SEMUA paket.
  const businessName = (data.businessName ?? "").trim();
  if (!businessName || businessName.length > 120) {
    return { success: false, error: "Nama toko wajib diisi (maksimal 120 karakter)." };
  }
  const reviewUrl = safeHttpUrl(data.googleReviewUrl);
  if (!reviewUrl) {
    return {
      success: false,
      error: "Link Google Review tidak valid (harus diawali http:// atau https://).",
    };
  }

  // Basic hanya boleh mengubah Nama Toko + Google Review. Field Pro lama
  // sengaja TIDAK di-null-kan agar saat upgrade lagi seluruh konfigurasi
  // sebelumnya tetap tersedia.
  const updatePayload: Record<string, unknown> = {
    business_name: businessName,
    google_review_url: reviewUrl,
  };

  if (isPro) {
    const ownerWhatsapp = (data.ownerWhatsapp ?? "").trim();
    if (ownerWhatsapp && !/^[0-9+\-\s()]{6,30}$/.test(ownerWhatsapp)) {
      return { success: false, error: "Nomor WhatsApp tidak valid." };
    }
    if (data.logoUrl && !isAllowedCloudinaryUrl(data.logoUrl)) {
      return { success: false, error: "URL logo tidak valid. Upload ulang logonya." };
    }
    if (data.coverImageUrl && !isAllowedCloudinaryUrl(data.coverImageUrl)) {
      return { success: false, error: "URL foto sampul tidak valid. Upload ulang fotonya." };
    }
    if (data.brandColor && !/^#[0-9a-fA-F]{6}$/.test(data.brandColor)) {
      return { success: false, error: "Warna brand tidak valid." };
    }
    for (const iconUrl of [data.reviewCardIconUrl, data.complaintCardIconUrl]) {
      if (iconUrl && !isAllowedCloudinaryUrl(iconUrl)) {
        return {
          success: false,
          error: "URL ikon kartu tidak valid. Upload ulang ikonnya.",
        };
      }
    }

    updatePayload.owner_whatsapp = ownerWhatsapp;
    if (data.logoUrl) updatePayload.logo_url = data.logoUrl;
    if (data.coverImageUrl) updatePayload.cover_image_url = data.coverImageUrl;
    if (data.coverPosition) updatePayload.cover_position = data.coverPosition;
    if (data.brandColor) updatePayload.brand_color = data.brandColor;

    if (data.socialLinks) {
      // Selalu dikirim (termasuk array kosong) agar owner Pro dapat
      // menghapus seluruh tautan lama.
      updatePayload.social_links = sanitizeSocialLinks(data.socialLinks)
        .slice(0, 20)
        .map((link) => ({
          ...link,
          label: link.label ? String(link.label).slice(0, 60) : link.label,
          icon_url: isAllowedCloudinaryUrl(link.icon_url) ? link.icon_url : null,
        }));
    }

    const cleanText = (v: string, max: number): string | null => {
      const t = v.replace(/\s+/g, " ").trim().slice(0, max);
      return t || null;
    };
    if (typeof data.connectTitle === "string") {
      updatePayload.connect_title = cleanText(data.connectTitle, 60);
    }
    if (typeof data.connectDescription === "string") {
      updatePayload.connect_description = cleanText(data.connectDescription, 140);
    }

    // Dua kartu pilihan: kosong -> NULL -> halaman pelanggan memakai bawaan.
    if (typeof data.reviewCardTitle === "string") {
      updatePayload.review_card_title = cleanText(
        data.reviewCardTitle,
        CARD_TITLE_MAX
      );
    }
    if (typeof data.reviewCardDescription === "string") {
      updatePayload.review_card_description = cleanText(
        data.reviewCardDescription,
        CARD_DESCRIPTION_MAX
      );
    }
    if (typeof data.reviewCardIconUrl === "string") {
      updatePayload.review_card_icon_url = data.reviewCardIconUrl || null;
    }
    if (typeof data.complaintCardTitle === "string") {
      updatePayload.complaint_card_title = cleanText(
        data.complaintCardTitle,
        CARD_TITLE_MAX
      );
    }
    if (typeof data.complaintCardDescription === "string") {
      updatePayload.complaint_card_description = cleanText(
        data.complaintCardDescription,
        CARD_DESCRIPTION_MAX
      );
    }
    if (typeof data.complaintCardIconUrl === "string") {
      updatePayload.complaint_card_icon_url = data.complaintCardIconUrl || null;
    }
  }

  // Ikon custom lama hanya relevan untuk Pro. Basic tidak menyentuh
  // social_links sama sekali sehingga asset Pro lama tetap aman.
  let oldIconUrls: string[] = [];
  if (isPro && data.socialLinks) {
    const { data: current } = await supabase
      .from("products")
      .select("social_links")
      .eq("id", productId)
      .maybeSingle();
    oldIconUrls = iconUrlsOf(current?.social_links);
  }

  // Ikon kartu pilihan yang tersimpan SEKARANG - supaya setelah berhasil
  // tersimpan kita tahu file mana yang sudah diganti / dihapus owner.
  let oldReviewIcon: string | null = null;
  let oldComplaintIcon: string | null = null;
  const touchesCardIcons =
    "review_card_icon_url" in updatePayload ||
    "complaint_card_icon_url" in updatePayload;
  if (isPro && touchesCardIcons) {
    const { data: currentCards } = await supabase
      .from("products")
      .select("review_card_icon_url, complaint_card_icon_url")
      .eq("id", productId)
      .maybeSingle();
    oldReviewIcon = currentCards?.review_card_icon_url || null;
    oldComplaintIcon = currentCards?.complaint_card_icon_url || null;
  }

  // .select("id") = minta database mengembalikan baris yang BENAR-BENAR
  // ter-update. Tanpa ini, update yang ditolak diam-diam oleh RLS (0 baris)
  // tidak menghasilkan error apa pun dan form tetap menulis "berhasil".
  const { data: updatedRows, error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", productId)
    .select("id");

  if (error) {
    console.error("Gagal update settings:", error.message);
    return { success: false, error: "Gagal menyimpan pengaturan." };
  }
  if (!updatedRows || updatedRows.length === 0) {
    console.error("Update settings: 0 baris berubah (kemungkinan ditolak RLS).");
    return {
      success: false,
      error: "Pengaturan tidak tersimpan (akses ditolak). Silakan login ulang.",
    };
  }

  // Segarkan data dasbor (props SettingsForm berasal dari server; tanpa ini
  // form yang dibuka ulang setelah pindah tab menampilkan nilai LAMA) dan
  // halaman feedback pelanggan toko ini.
  revalidatePath("/dashboard");
  revalidatePath(`/feedback/${productId}`);

  // Pengaturan SUDAH tersimpan -> baru bersihkan file ikon kartu lama yang
  // diganti atau dihapus (best-effort, pola sama dengan ikon "Connect with Us").
  if (oldReviewIcon || oldComplaintIcon) {
    // Ikon yang dipakai SETELAH update: nilai baru kalau dikirim, kalau
    // tidak (kolom tidak disentuh) tetap nilai lama.
    const nextReview =
      "review_card_icon_url" in updatePayload
        ? updatePayload.review_card_icon_url
        : oldReviewIcon;
    const nextComplaint =
      "complaint_card_icon_url" in updatePayload
        ? updatePayload.complaint_card_icon_url
        : oldComplaintIcon;
    const keptCardIcons = new Set(
      [nextReview, nextComplaint].filter(
        (u): u is string => typeof u === "string" && u.length > 0
      )
    );
    for (const url of [oldReviewIcon, oldComplaintIcon]) {
      if (!url) continue;
      if (keptCardIcons.has(url) || !isAllowedCloudinaryUrl(url)) continue;
      if (await cardIconUsedElsewhere(url, productId)) continue;
      const publicId = extractCloudinaryPublicId(url);
      if (!publicId) continue;
      try {
        await deleteCloudinaryImage(publicId);
      } catch (err) {
        console.error("Gagal hapus ikon kartu lama dari Cloudinary:", err);
      }
    }
  }

  if (isPro && data.socialLinks) {
    const kept = new Set(iconUrlsOf(updatePayload.social_links));
    for (const url of oldIconUrls) {
      if (kept.has(url) || !isAllowedCloudinaryUrl(url)) continue;
      if (await iconUsedByOtherStore(url, productId)) continue;
      const publicId = extractCloudinaryPublicId(url);
      if (!publicId) continue;
      try {
        await deleteCloudinaryImage(publicId);
      } catch (err) {
        console.error("Gagal hapus ikon lama dari Cloudinary:", err);
      }
    }
  }

  return { success: true };
}

/**
 * Hapus logo toko - baik dari Storage (file aslinya) maupun dari
 * kolom logo_url di database.
 */
export async function removeLogo(
  productId: string,
  logoUrl: string
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  // Pakai URL yang TERSIMPAN di database toko ini (lewat RLS), bukan URL
  // kiriman client - supaya action ini tidak bisa dipakai menghapus
  // gambar toko lain. Parameter logoUrl sengaja diabaikan.
  const { data: own } = await supabase
    .from("products")
    .select("logo_url")
    .eq("id", productId)
    .maybeSingle();
  if (!own) {
    return { success: false, error: "Toko tidak ditemukan." };
  }
  logoUrl = (own.logo_url as string | null) ?? "";

  if (isAllowedCloudinaryUrl(logoUrl)) {
    // Logo baru (di Cloudinary) - hapus lewat Admin API
    const publicId = extractCloudinaryPublicId(logoUrl);
    if (publicId) {
      try {
        await deleteCloudinaryImage(publicId);
      } catch (err) {
        console.error("Gagal hapus logo dari Cloudinary:", err);
        // Tidak fatal - tetap lanjut kosongkan logo_url
      }
    }
  } else {
    // Logo LAMA (masih di Supabase Storage, sebelum perbaikan ini)
    const marker = "/business-logos/";
    const idx = logoUrl.indexOf(marker);
    if (idx !== -1) {
      const path = logoUrl.slice(idx + marker.length);
      const { error: storageError } = await supabase.storage
        .from("business-logos")
        .remove([path]);

      if (storageError) {
        console.error("Gagal hapus file logo lama:", storageError.message);
      }
    }
  }

  const { error } = await supabase
    .from("products")
    .update({ logo_url: null })
    .eq("id", productId);

  if (error) {
    console.error("Gagal hapus logo dari database:", error.message);
    return { success: false, error: "Gagal menghapus logo." };
  }

  return { success: true };
}

/**
 * Hapus foto sampul (cover) toko - sama persis polanya dengan
 * removeLogo(), cuma target kolomnya beda.
 */
export async function removeCoverImage(
  productId: string,
  coverImageUrl: string
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  // Sama seperti removeLogo: pakai URL yang tersimpan di database.
  const { data: own } = await supabase
    .from("products")
    .select("cover_image_url")
    .eq("id", productId)
    .maybeSingle();
  if (!own) {
    return { success: false, error: "Toko tidak ditemukan." };
  }
  coverImageUrl = (own.cover_image_url as string | null) ?? "";

  if (isAllowedCloudinaryUrl(coverImageUrl)) {
    const publicId = extractCloudinaryPublicId(coverImageUrl);
    if (publicId) {
      try {
        await deleteCloudinaryImage(publicId);
      } catch (err) {
        console.error("Gagal hapus cover dari Cloudinary:", err);
      }
    }
  }

  const { error } = await supabase
    .from("products")
    .update({ cover_image_url: null, cover_position: null })
    .eq("id", productId);

  if (error) {
    console.error("Gagal hapus cover dari database:", error.message);
    return { success: false, error: "Gagal menghapus foto sampul." };
  }

  return { success: true };
}

/**
 * Tandai keluhan sebagai Pending/Resolved.
 * RLS "owner_update_own_feedbacks" yang menjamin owner cuma bisa
 * ubah keluhan milik tokonya sendiri.
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  status: "Pending" | "Resolved"
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  // RLS memastikan feedback yang terbaca adalah milik owner ini.
  // Setelah itu cek entitlement: paket Basic boleh menyimpan histori
  // feedback lama, tetapi pengelolaannya dibekukan sampai upgrade Pro.
  const { data: feedback } = await supabase
    .from("feedbacks")
    .select("product_id")
    .eq("id", feedbackId)
    .maybeSingle();

  if (!feedback) {
    return { success: false, error: "Keluhan tidak ditemukan atau akses ditolak." };
  }

  const { data: product } = await supabase
    .from("products")
    .select("plan")
    .eq("id", feedback.product_id)
    .maybeSingle();

  if (!product || product.plan !== "pro") {
    return { success: false, error: "Fitur keluhan hanya tersedia pada paket Pro." };
  }

  const { error } = await supabase
    .from("feedbacks")
    .update({ status })
    .eq("id", feedbackId);

  if (error) {
    console.error("Gagal update status feedback:", error.message);
    return { success: false, error: "Gagal mengubah status." };
  }

  return { success: true };
}

/**
 * Hapus foto dari Cloudinary dan KEMBALIKAN hasilnya (true = beres).
 * Beda dengan deleteCloudinaryImage di atas yang best-effort dan diam
 * saja kalau gagal: untuk hapus manual keluhan kita perlu tahu hasilnya,
 * karena kalau baris database sudah terhapus tapi fotonya masih ada di
 * Cloudinary, foto itu jadi yatim dan tidak akan pernah dibersihkan cron
 * (cron mencarinya lewat baris database yang sudah tidak ada).
 * "not_found" dianggap beres - artinya fotonya memang sudah tidak ada.
 */
async function deleteCloudinaryImageStrict(publicId: string): Promise<boolean> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return false;

  try {
    const auth = btoa(`${apiKey}:${apiSecret}`);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?public_ids[]=${encodeURIComponent(
        publicId
      )}`,
      { method: "DELETE", headers: { Authorization: `Basic ${auth}` } }
    );
    if (!res.ok) return false;
    const result = await res.json();
    const state = result?.deleted?.[publicId];
    return state === "deleted" || state === "not_found";
  } catch {
    return false;
  }
}

/**
 * Hapus 1 keluhan secara manual oleh owner: foto di Cloudinary (atau
 * Storage untuk data lama) DAN barisnya di database. Link foto pendek
 * (/p/kode) ikut mati otomatis karena kodenya tersimpan di baris yang
 * sama.
 *
 * Kepemilikan dicek lewat client yang ikut sesi login - RLS hanya
 * mengizinkan owner melihat keluhan tokonya sendiri, jadi keluhan
 * milik toko lain akan tampil "tidak ditemukan". Baru setelah itu
 * penghapusan dilakukan lewat service client, karena tabel feedbacks
 * memang tidak punya policy DELETE untuk owner.
 */
export async function deleteFeedback(feedbackId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  const { data: feedback, error: findError } = await supabase
    .from("feedbacks")
    .select("id, product_id, photo_url, photo_path")
    .eq("id", feedbackId)
    .maybeSingle();

  if (findError || !feedback) {
    return { success: false, error: "Keluhan tidak ditemukan atau sudah dihapus." };
  }

  // Feedback yang masih terlihat lewat RLS memang milik owner ini, tetapi
  // DELETE adalah fitur Pro. Cek plan sebelum menyentuh file Cloudinary
  // maupun memakai service role untuk menghapus row database.
  const { data: product } = await supabase
    .from("products")
    .select("plan")
    .eq("id", feedback.product_id)
    .maybeSingle();

  if (!product || product.plan !== "pro") {
    return { success: false, error: "Fitur keluhan hanya tersedia pada paket Pro." };
  }

  const service = createServiceClient();

  // 1. Foto di Cloudinary dulu. Kalau gagal, batalkan - jangan sampai
  //    baris terhapus tapi fotonya tertinggal.
  if (feedback.photo_url) {
    const publicId = isAllowedCloudinaryUrl(feedback.photo_url)
      ? extractCloudinaryPublicId(feedback.photo_url)
      : null;
    if (publicId) {
      const ok = await deleteCloudinaryImageStrict(publicId);
      if (!ok) {
        return {
          success: false,
          error: "Gagal menghapus foto dari Cloudinary. Coba lagi sebentar lagi.",
        };
      }
    }
  }

  // 2. Foto lama di Supabase Storage (sebelum pindah ke Cloudinary).
  if (feedback.photo_path) {
    const { error: storageError } = await service.storage
      .from("complaint-photos")
      .remove([feedback.photo_path]);
    if (storageError) {
      console.error("Gagal hapus foto lama dari Storage:", storageError.message);
      return { success: false, error: "Gagal menghapus foto lama. Coba lagi." };
    }
  }

  // 3. Terakhir baris databasenya.
  const { data: deleted, error: deleteError } = await service
    .from("feedbacks")
    .delete()
    .eq("id", feedbackId)
    .select("id");

  if (deleteError || !deleted || deleted.length === 0) {
    console.error("Gagal hapus keluhan:", deleteError?.message);
    return { success: false, error: "Gagal menghapus keluhan dari database." };
  }

  return { success: true };
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
