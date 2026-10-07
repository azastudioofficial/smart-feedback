// lib/card-number.ts
//
// Nomor kartu INTERNAL (AZA20001, AZA20002, ...). Dipakai sebagai label di
// layar, laporan, nama file, dan saat bicara dengan pembeli/reseller - supaya
// kode acak di QR (short_code) tidak perlu disebut atau ditampilkan.
// Nomor ini TIDAK dipakai di alamat (URL) dan tidak membuka apa pun; hanya
// kode acak yang membuka kartu.
//
// Sumber nomor: kolom products.card_seq (sequence di database, mulai 20001,
// lihat sql/15-card-number.sql). Awalan "AZA" cukup diubah di sini.

export const CARD_NUMBER_PREFIX = "AZA";

/** 20001 -> "AZA20001". Kosong/tidak valid -> null (pemanggil pakai cadangan). */
export function formatCardNumber(
  seq: number | string | null | undefined
): string | null {
  if (seq === null || seq === undefined || seq === "") return null;
  const n = Number(seq);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${CARD_NUMBER_PREFIX}${Math.trunc(n)}`;
}

/**
 * Teks pencarian -> angka urut. "AZA20001", "aza20001", dan "20001"
 * semuanya menghasilkan 20001. Selain itu null.
 */
export function parseCardNumber(term: string): number | null {
  const m = term
    .trim()
    .match(new RegExp(`^(?:${CARD_NUMBER_PREFIX})?(\\d{1,12})$`, "i"));
  return m ? Number(m[1]) : null;
}
