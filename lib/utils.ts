// lib/utils.ts

import imageCompression from "browser-image-compression";

/**
 * Generate shortcode acak 6 karakter untuk QR code baru.
 * Sengaja HINDARI karakter yang gampang salah baca saat dicetak
 * di akrilik kecil: 0/O, 1/I/l.
 */
const SAFE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

export function generateShortCode(length = 6): string {
  let result = "";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += SAFE_CHARS[array[i] % SAFE_CHARS.length];
  }
  return result;
}

/**
 * Ubah teks bebas (misal nama toko) jadi slug URL yang rapi:
 * huruf kecil, spasi/simbol jadi tanda hubung.
 * Contoh: "Kopi Kenangan!" -> "kopi-kenangan"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // hilangkan aksen/diakritik
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

/**
 * Generate PIN aktivasi 6 digit angka.
 * Ini PIN mentah yang ditampilkan/dicetak sekali saja untuk owner toko.
 * Yang disimpan ke database adalah HASH-nya (lihat schema.sql, kolom pin_hash,
 * pakai crypt() dari pgcrypto — dilakukan di sisi SQL, bukan di sini).
 */
export function generateActivationPin(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const pin = 100000 + (array[0] % 900000); // hasil: 100000–999999
  return pin.toString();
}

/**
 * Kompresi foto bukti keluhan di browser sebelum upload,
 * supaya hemat Supabase Storage (target free tier).
 * Output: WebP, maksimal 1280px sisi terpanjang, target ~150KB.
 */
export async function compressComplaintPhoto(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.15, // ~150 KB
    maxWidthOrHeight: 1280,
    useWebWorker: true,
    fileType: "image/webp" as const,
    initialQuality: 0.8,
  };

  try {
    const compressed = await imageCompression(file, options);
    // Pastikan ekstensi/nama file konsisten .webp
    return new File(
      [compressed],
      `${crypto.randomUUID()}.webp`,
      { type: "image/webp" }
    );
  } catch (err) {
    console.error("Gagal kompresi foto:", err);
    throw new Error("Gagal memproses foto. Coba gunakan foto lain.");
  }
}

/**
 * Kompresi khusus untuk IKON CUSTOM di fitur "Connect with Us".
 * Beda dari compressComplaintPhoto/logo di atas - ini dipakai sebagai
 * ikon bubble kecil (max ~56px di halaman pelanggan), jadi TIDAK perlu
 * resolusi besar sama sekali. Target ukuran sengaja dibuat sangat
 * kecil (~30KB, sisi terpanjang 240px) supaya:
 * 1. Tidak numpuk kuota storage Cloudinary kalau banyak toko upload
 *    ikon custom.
 * 2. Halaman feedback pelanggan tetap ringan & cepat dimuat meski
 *    toko punya banyak tautan dengan ikon custom semua.
 */
export async function compressIconImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.03, // ~30 KB - cukup buat ikon bulat kecil, tidak lebih
    maxWidthOrHeight: 240,
    useWebWorker: true,
    fileType: "image/webp" as const,
    initialQuality: 0.85,
  };

  try {
    const compressed = await imageCompression(file, options);
    return new File(
      [compressed],
      `icon-${crypto.randomUUID()}.webp`,
      { type: "image/webp" }
    );
  } catch (err) {
    console.error("Gagal kompresi ikon:", err);
    throw new Error("Gagal memproses gambar ikon. Coba gunakan gambar lain.");
  }
}

/**
 * Upload foto (yang sudah dikompres) ke Cloudinary lewat Unsigned
 * Upload Preset - proses ini murni terjadi di browser, tidak lewat
 * server kita sama sekali. Mengembalikan secure_url dari Cloudinary.
 */
export async function uploadToCloudinary(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Konfigurasi Cloudinary belum lengkap. Cek .env.local."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Cloudinary upload gagal:", errText);
    throw new Error("Gagal mengupload foto. Coba lagi.");
  }

  const data = await response.json();
  return data.secure_url as string;
}

/**
 * Sama seperti uploadToCloudinary, tapi pakai XMLHttpRequest supaya
 * bisa membaca progress upload ASLI (byte demi byte), bukan animasi
 * palsu. onProgress dipanggil berkali-kali dengan angka 0-100.
 */
export function uploadToCloudinaryWithProgress(
  file: File,
  onProgress: (percent: number) => void
): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  return new Promise((resolve, reject) => {
    if (!cloudName || !uploadPreset) {
      reject(new Error("Konfigurasi Cloudinary belum lengkap. Cek .env.local."));
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url as string);
        } catch {
          reject(new Error("Gagal membaca balasan Cloudinary."));
        }
      } else {
        reject(new Error("Gagal mengupload foto. Coba lagi."));
      }
    };

    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload."));

    xhr.send(formData);
  });
}

/**
 * Sisipkan parameter transformasi Cloudinary (resize, auto format,
 * auto quality) ke dalam URL yang sudah ada, tanpa perlu upload ulang.
 * Kalau URL-nya bukan URL Cloudinary (misal foto lama di Supabase
 * Storage), dikembalikan apa adanya - transformasi ini cuma berlaku
 * untuk URL Cloudinary.
 *
 * Contoh:
 * https://res.cloudinary.com/xxx/image/upload/v123/foto.webp
 * -> https://res.cloudinary.com/xxx/image/upload/f_auto,q_auto,w_400/v123/foto.webp
 */
export function cloudinaryThumbnail(
  url: string,
  transform: string = "f_auto,q_auto,w_400"
): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const insertAt = idx + marker.length;
  return url.slice(0, insertAt) + transform + "/" + url.slice(insertAt);
}

/**
 * Gelapkan warna hex sekian persen - dipakai untuk hitung otomatis
 * warna "hover" dari warna tema custom yang dipilih owner toko,
 * supaya owner cuma perlu pilih 1 warna, bukan 2.
 */
/**
 * Ambil public_id Cloudinary dari secure_url yang tersimpan.
 * Dipakai bersama oleh fitur hapus foto/logo & cron cleanup.
 */
export function extractCloudinaryPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match ? match[1] : null;
}

export function darkenHex(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return hex;

  const r = Math.max(0, Math.floor(((num >> 16) & 255) * (1 - percent / 100)));
  const g = Math.max(0, Math.floor(((num >> 8) & 255) * (1 - percent / 100)));
  const b = Math.max(0, Math.floor((num & 255) * (1 - percent / 100)));

  return (
    "#" +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Kebalikan darkenHex - campur warna dengan putih sekian persen.
 * Dipakai untuk turunkan versi SANGAT terang dari warna brand,
 * buat gradient background yang lembut tanpa owner perlu pilih
 * warna kedua secara manual.
 */
export function lightenHex(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return hex;

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const mix = (channel: number) =>
    Math.min(255, Math.round(channel + (255 - channel) * (percent / 100)));

  return (
    "#" +
    [mix(r), mix(g), mix(b)]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Susun teks pesan WhatsApp pra-isi untuk owner toko.
 * photoUrl idealnya SIGNED URL (bukan URL publik permanen) — lihat server.ts.
 */
export function buildWhatsappMessage(params: {
  businessName: string;
  customerName?: string;
  complaintText: string;
  photoUrl?: string | null;
}): string {
  const { businessName, customerName, complaintText, photoUrl } = params;

  const lines = [
    `Halo Owner, ada masukan baru dari pelanggan di ${businessName}:`,
    `- Nama: ${customerName?.trim() || "(Tidak disebutkan)"}`,
    `- Keluhan: ${complaintText.trim()}`,
  ];

  if (photoUrl) {
    lines.push(`- Foto Bukti: ${photoUrl}`);
  }

  return encodeURIComponent(lines.join("\n"));
}

/**
 * Bangun URL wa.me lengkap siap redirect.
 * Nomor WA disimpan bebas format di DB, dirapikan di sini
 * (hapus spasi/simbol, pastikan diawali kode negara 62).
 */
export function buildWhatsappUrl(rawPhone: string, message: string): string {
  let phone = rawPhone.replace(/[^0-9]/g, "");
  if (phone.startsWith("0")) {
    phone = "62" + phone.slice(1);
  }
  return `https://wa.me/${phone}?text=${message}`;
}
