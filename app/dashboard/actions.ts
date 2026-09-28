"use server";
// app/dashboard/actions.ts

import { redirect } from "next/navigation";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { extractCloudinaryPublicId } from "@/lib/utils";
import { sanitizeSocialLinks, type SocialLink } from "@/lib/social-links";

type ActionResult = { success: boolean; error?: string };

/**
 * Hapus 1 file ikon custom (tautan Connect with Us) dari Cloudinary.
 * Dipanggil best-effort saat owner ganti/hapus ikon custom - TIDAK
 * menyentuh kolom social_links di database (itu tetap disimpan lewat
 * updateSettings seperti biasa), cuma bersihkan file lamanya di
 * Cloudinary supaya tidak menumpuk file yatim.
 */
export async function removeSocialIcon(iconUrl: string): Promise<ActionResult> {
  if (!iconUrl.includes("res.cloudinary.com")) {
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
  }
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  const updatePayload: Record<string, unknown> = {
    business_name: data.businessName,
    google_review_url: data.googleReviewUrl,
    owner_whatsapp: data.ownerWhatsapp,
  };
  if (data.logoUrl) {
    updatePayload.logo_url = data.logoUrl;
  }
  if (data.coverImageUrl) {
    updatePayload.cover_image_url = data.coverImageUrl;
  }
  if (data.coverPosition) {
    // Dikirim tiap kali ada foto sampul aktif - termasuk waktu owner
    // CUMA geser posisi tanpa ganti fotonya sama sekali.
    updatePayload.cover_position = data.coverPosition;
  }
  if (data.brandColor) {
    updatePayload.brand_color = data.brandColor;
  }
  if (data.socialLinks) {
    // Selalu dikirim (bahkan array kosong) - supaya owner yang
    // menghapus SEMUA tautan lama tetap kesimpen kosong, bukan malah
    // dianggap "tidak berubah" dan tetap pakai data lama.
    updatePayload.social_links = sanitizeSocialLinks(data.socialLinks);
  }

  const { error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", productId);

  if (error) {
    console.error("Gagal update settings:", error.message);
    return { success: false, error: "Gagal menyimpan pengaturan." };
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

  if (logoUrl.includes("res.cloudinary.com")) {
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

  if (coverImageUrl.includes("res.cloudinary.com")) {
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
    .select("id, photo_url, photo_path")
    .eq("id", feedbackId)
    .maybeSingle();

  if (findError || !feedback) {
    return { success: false, error: "Keluhan tidak ditemukan atau sudah dihapus." };
  }

  const service = createServiceClient();

  // 1. Foto di Cloudinary dulu. Kalau gagal, batalkan - jangan sampai
  //    baris terhapus tapi fotonya tertinggal.
  if (feedback.photo_url) {
    const publicId = feedback.photo_url.includes("res.cloudinary.com")
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
