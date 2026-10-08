// lib/feedback-cards.ts
//
// Dua kartu pilihan di halaman feedback pelanggan:
//   1. kartu "Review"  (ke Google Maps)
//   2. kartu "Layanan Pelanggan" (form keluhan)
// Owner Pro boleh mengganti ikon, judul, dan keterangannya. Kalau tidak
// diganti, pelanggan melihat teks & ikon BAWAAN di bawah ini - teks bawaan
// sengaja dipusatkan di sini supaya halaman pelanggan dan form pengaturan
// owner (placeholder) selalu memakai kalimat yang sama.

export const REVIEW_CARD_DEFAULT = {
  title: "Bagikan Pengalaman Anda",
  description: "Bantu bisnis kami berkembang dengan ulasan di Google Maps.",
} as const;

export const COMPLAINT_CARD_DEFAULT = {
  title: "Hubungi Layanan Pelanggan",
  description: "Dapatkan bantuan cepat atau solusi masalah.",
} as const;

// Batas panjang - dipakai form owner, server action, dan (di SQL) CHECK.
export const CARD_TITLE_MAX = 40;
export const CARD_DESCRIPTION_MAX = 120;

/** Teks kustom kalau diisi, kalau kosong/spasi saja -> teks bawaan. */
export function resolveCardText(
  custom: string | null | undefined,
  fallback: string
): string {
  return custom?.trim() || fallback;
}
