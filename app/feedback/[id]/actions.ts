"use server";
// app/feedback/[id]/actions.ts

import { createServiceClient } from "@/lib/supabase/server";
import { buildWhatsappMessage, buildWhatsappUrl, generateShortCode, slugify } from "@/lib/utils";

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
  const service = createServiceClient();

  // Ambil data toko langsung dari server (jangan percaya data dari client)
  const { data: product, error: productError } = await service
    .from("products")
    .select("business_name, owner_whatsapp, is_active, is_suspended")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError || !product) {
    return { success: false, error: "Toko tidak ditemukan." };
  }

  if (!product.is_active || product.is_suspended) {
    return { success: false, error: "Layanan ini sedang tidak aktif." };
  }

  const isAnonymous = !!input.anonymous;

  // Simpan keluhan ke database. photo_url = link Cloudinary langsung
  // (secure_url), tidak lagi lewat Supabase Storage. Kalau anonim,
  // nama TIDAK PERNAH disimpan sama sekali, walau sempat diisi di form.
  const { data: insertedFeedback, error: insertError } = await service
    .from("feedbacks")
    .insert({
      product_id: input.productId,
      customer_name: isAnonymous ? null : input.customerName || null,
      complaint_text: input.complaintText,
      photo_url: input.photoUrl || null,
      is_anonymous: isAnonymous,
    })
    .select("id")
    .single();

  if (insertError || !insertedFeedback) {
    console.error("Gagal simpan feedback:", insertError?.message);
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
    customerName: input.customerName,
    complaintText: input.complaintText,
    photoUrl: photoShortUrl,
  });

  const whatsappUrl = buildWhatsappUrl(product.owner_whatsapp, message);

  return { success: true, whatsappUrl };
}

/**
 * Dipanggil saat pelanggan klik tombol "Puas / Bagus", sebelum
 * redirect ke Google Review. Dipakai untuk hitung rasio di Analytics.
 */
export async function logPositiveClick(productId: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("positive_clicks")
    .insert({ product_id: productId });

  if (error) {
    console.error("Gagal mencatat klik puas:", error.message);
    // Tidak fatal - pelanggan tetap harus lanjut ke Google Review walau ini gagal
  }
}
