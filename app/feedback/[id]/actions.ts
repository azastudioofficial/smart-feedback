"use server";
// app/feedback/[id]/actions.ts

import { createServiceClient } from "@/lib/supabase/server";
import { buildWhatsappMessage, buildWhatsappUrl, generateShortCode, slugify } from "@/lib/utils";
import { isAllowedCloudinaryUrl } from "@/lib/safe-url";
import { checkRateLimit } from "@/lib/rate-limit";
import { discardUnreferencedUpload } from "@/lib/asset-cleanup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_COMPLAINT_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
// Batas wajar per toko: maks 20 keluhan per 10 menit. Cukup longgar untuk
// toko ramai, tapi menghentikan banjir spam lewat endpoint publik ini.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type SubmitFeedbackInput = {
  productId: string;
  customerName?: string;
  complaintText: string;
  photoUrl?: string | null;
  anonymous?: boolean;
};

type SubmitFeedbackResult = {
  success: boolean;
  whatsappUrl?: string;
  anonymous?: boolean;
  error?: string;
};

export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<SubmitFeedbackResult> {
  // Validasi input di server (form di browser bisa dilewati).
  if (!UUID_REGEX.test(input.productId ?? "")) {
    return { success: false, error: "Toko tidak ditemukan." };
  }
  // Batas per IP (Cloudflare Rate Limiting, lihat wrangler.jsonc).
  if (!(await checkRateLimit("FEEDBACK_LIMITER", "feedback"))) {
    return {
      success: false,
      error: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
    };
  }

  const complaintText = (input.complaintText ?? "").trim();
  if (!complaintText) {
    return { success: false, error: "Mohon isi pesan Anda." };
  }
  if (complaintText.length > MAX_COMPLAINT_LENGTH) {
    return {
      success: false,
      error: `Pesan terlalu panjang (maksimal ${MAX_COMPLAINT_LENGTH} karakter).`,
    };
  }
  const customerName = (input.customerName ?? "").trim().slice(0, MAX_NAME_LENGTH);

  // Foto hanya boleh URL Cloudinary milik kita - mencegah link palsu
  // (open redirect lewat /p/[kode]) dan penghapusan file orang lain.
  if (input.photoUrl && !isAllowedCloudinaryUrl(input.photoUrl)) {
    return { success: false, error: "Foto tidak valid. Coba upload ulang." };
  }

  const service = createServiceClient();

  // Foto sudah diupload browser SEBELUM fungsi ini dipanggil. Kalau pengiriman
  // gagal di bawah (toko tidak aktif, terlalu banyak pesan, database error),
  // foto itu tidak akan pernah terhubung ke keluhan mana pun - buang supaya
  // tidak menumpuk di Cloudinary. Aman: file yang sudah tersimpan di keluhan
  // atau yang bukan upload baru tidak disentuh (lihat discardUnreferencedUpload).
  const dropPhoto = async () => {
    if (input.photoUrl) {
      await discardUnreferencedUpload(input.photoUrl, "feedback-submit-failed");
    }
  };

  // Ambil data toko langsung dari server (jangan percaya data dari client)
  const { data: product, error: productError } = await service
    .from("products")
    .select("business_name, owner_whatsapp, is_active, is_suspended, plan")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError || !product) {
    await dropPhoto();
    return { success: false, error: "Toko tidak ditemukan." };
  }

  if (!product.is_active || product.is_suspended) {
    await dropPhoto();
    return { success: false, error: "Layanan ini sedang tidak aktif." };
  }

  // Form keluhan hanya untuk paket Pro (dicek di server, bukan cuma di UI).
  if (product.plan !== "pro") {
    await dropPhoto();
    return { success: false, error: "Layanan ini sedang tidak aktif." };
  }

  // Rate limit sederhana berbasis database (tanpa tabel baru).
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount } = await service
    .from("feedbacks")
    .select("id", { count: "exact", head: true })
    .eq("product_id", input.productId)
    .gte("created_at", since);

  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    await dropPhoto();
    return {
      success: false,
      error: "Terlalu banyak pesan masuk saat ini. Coba lagi beberapa menit lagi.",
    };
  }

  const isAnonymous = !!input.anonymous;

  // Simpan keluhan ke database. photo_url = link Cloudinary langsung
  // (secure_url), tidak lagi lewat Supabase Storage. Kalau anonim,
  // nama TIDAK PERNAH disimpan sama sekali, walau sempat diisi di form.
  const { data: insertedFeedback, error: insertError } = await service
    .from("feedbacks")
    .insert({
      product_id: input.productId,
      customer_name: isAnonymous ? null : customerName || null,
      complaint_text: complaintText,
      photo_url: input.photoUrl || null,
      is_anonymous: isAnonymous,
    })
    .select("id")
    .single();

  if (insertError || !insertedFeedback) {
    console.error("Gagal simpan feedback:", insertError?.message);
    await dropPhoto();
    return { success: false, error: "Gagal menyimpan keluhan. Coba lagi." };
  }

  // Kalau dikirim anonim: BERHENTI DI SINI. Tidak ada link foto WA,
  // tidak ada redirect WhatsApp - cukup masuk ke dashboard owner saja.
  if (isAnonymous) {
    return { success: true, anonymous: true };
  }

  // Kalau ada foto, buat LINK PENDEK (domain.com/p/xxxxxxxx) yang nanti
  // redirect langsung ke URL Cloudinary - link WA jadi rapi & pendek.
  let photoShortUrl: string | null = null;
  if (input.photoUrl) {
    const slug = slugify(product.business_name || "toko");
    const suffix = generateShortCode(4).toLowerCase();
    const shortCode = `keluhan-${slug}-${suffix}`;

    const { error: codeError } = await service
      .from("feedbacks")
      .update({ photo_short_code: shortCode })
      .eq("id", insertedFeedback.id);

    if (codeError) {
      console.error("Gagal buat kode foto pendek:", codeError.message);
      // Tidak fatal - keluhan tetap tersimpan, cuma tanpa link foto di pesan WA
    } else {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      photoShortUrl = `${baseUrl}/p/${shortCode}`;
    }
  }

  if (!product.owner_whatsapp) {
    return {
      success: false,
      error:
        "Keluhan sudah tersimpan, tapi nomor WhatsApp owner belum diatur.",
    };
  }

  const message = buildWhatsappMessage({
    businessName: product.business_name ?? "Toko",
    customerName: customerName || undefined,
    complaintText,
    photoUrl: photoShortUrl,
  });

  const whatsappUrl = buildWhatsappUrl(product.owner_whatsapp, message);

  return { success: true, whatsappUrl };
}

/**
 * Dipanggil saat pelanggan klik tombol "Tulis Review di Google Maps",
 * sebelum redirect ke Google Review. Dipakai untuk hitung klik review
 * dan konversinya di Analytics.
 */
export async function logPositiveClick(productId: string): Promise<void> {
  if (!UUID_REGEX.test(productId ?? "")) return;

  const service = createServiceClient();

  // Hanya hitung klik untuk toko yang benar-benar aktif - supaya angka
  // analytics tidak bisa dikotori dengan id sembarang.
  const { data: product } = await service
    .from("products")
    .select("is_active, is_suspended")
    .eq("id", productId)
    .maybeSingle();
  if (!product || !product.is_active || product.is_suspended) return;

  const { error } = await service
    .from("positive_clicks")
    .insert({ product_id: productId });

  if (error) {
    console.error("Gagal mencatat klik puas:", error.message);
    // Tidak fatal - pelanggan tetap harus lanjut ke Google Review walau ini gagal
  }
}
