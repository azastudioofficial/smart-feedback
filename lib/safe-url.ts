// lib/safe-url.ts
//
// Pengecekan URL yang dipakai bersama server action & route handler.
// Tujuannya menutup 2 celah:
//   1. Open redirect  - /p/[code] me-redirect ke URL yang tersimpan di
//      database; kalau URL itu bisa diisi sembarang orang, domainmu
//      bisa dipakai untuk link phishing.
//   2. Hapus file orang lain - fungsi hapus Cloudinary mengambil
//      public_id dari URL; URL palsu bisa menunjuk ke file toko lain.
//
// Aman dipakai di server maupun client (tidak ada import server-only).

/** Cloud name Cloudinary milik kita (dari env, sama seperti di upload). */
function ownCloudName(): string | null {
  const name = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return name && name.trim() ? name.trim() : null;
}

/**
 * true HANYA kalau URL-nya https://res.cloudinary.com/<cloud-name-kita>/...
 * Dicek lewat URL parser (bukan string.includes), jadi trik seperti
 * https://evil.com/res.cloudinary.com/... atau
 * https://res.cloudinary.com.evil.com/... ditolak.
 * Kalau env cloud name belum ada, hasilnya false (gagal aman).
 */
export function isAllowedCloudinaryUrl(
  url: string | null | undefined
): boolean {
  if (!url || typeof url !== "string" || url.length > 2000) return false;
  const cloud = ownCloudName();
  if (!cloud) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      !u.username &&
      !u.password &&
      u.pathname.startsWith(`/${cloud}/`)
    );
  } catch {
    return false;
  }
}

/**
 * Rapikan URL tujuan buatan owner (mis. link Google Review).
 * - hanya http/https (menolak javascript:, data:, dll)
 * - kalau owner mengetik tanpa skema, ditambah https://
 * Mengembalikan URL bersih, atau null kalau tidak valid.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return null;

  // Sudah ada skema selain http/https (javascript:, data:, ftp:, ...) -> tolak.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Versi ringan untuk dipakai di komponen client sebelum redirect. */
export function isHttpUrl(raw: string | null | undefined): boolean {
  return typeof raw === "string" && /^https?:\/\//i.test(raw.trim());
}
