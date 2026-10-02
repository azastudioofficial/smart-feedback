// lib/rate-limit.ts
//
// Rate limit per IP memakai fitur "Rate Limiting" bawaan Cloudflare
// Workers (binding `ratelimits` di wrangler.jsonc). Gratis, tidak perlu
// domain sendiri, tidak perlu tabel database.
//
// Catatan jujur: hitungannya per lokasi data center Cloudflare dan
// sifatnya "perkiraan" - cocok untuk menahan spam/bot, bukan untuk
// batas yang harus akurat sampai 1 request.
//
// Sengaja FAIL-OPEN: kalau binding tidak ada (mis. saat `npm run dev`
// di komputer) atau terjadi error, request tetap diizinkan - jangan
// sampai pelanggan asli ikut terblokir karena masalah teknis.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";

type Limiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

/** true = boleh lanjut, false = kena batas. */
export async function checkRateLimit(
  bindingName: string,
  scope: string
): Promise<boolean> {
  try {
    const { env } = getCloudflareContext();
    const limiter = (env as unknown as Record<string, unknown>)[bindingName] as
      | Limiter
      | undefined;
    if (!limiter) return true;

    const h = await headers();
    const ip =
      h.get("cf-connecting-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    // Tanpa IP yang jelas, jangan batasi (semua orang akan berbagi 1 kunci).
    if (!ip) return true;

    const { success } = await limiter.limit({ key: `${scope}:${ip}` });
    return success;
  } catch (err) {
    console.error("Rate limit error (diabaikan):", err);
    return true;
  }
}
