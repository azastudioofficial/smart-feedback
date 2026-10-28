// lib/social-links.ts
//
// Definisi tipe & metadata untuk fitur "Connect with Us" - daftar
// tautan (Instagram, Website, Katalog, TikTok, Shopee, dst) yang
// owner bisa atur di dashboard, dan yang muncul sebagai tombol-tombol
// di halaman feedback pelanggan waktu bagian "Terhubung dengan Kami"
// di-klik/dibuka.
//
// Disimpan di kolom products.social_links (jsonb) sebagai array biar
// owner bisa tambah/hapus/urutkan tautan sesuka mereka tanpa perlu
// migrasi kolom baru tiap kali ada platform baru.

import type { ComponentType, CSSProperties } from "react";
import {
  InstagramIcon,
  TikTokIcon,
  FacebookIcon,
  YouTubeIcon,
  WhatsAppIcon,
  ShopeeIcon,
  GlobeSolidIcon,
  ProductsSolidIcon,
  LinkSolidIcon,
} from "@/components/brand-icons";

// Tipe ikon platform - semua ikon (logo merek & ikon solid umum) berasal
// dari components/brand-icons.tsx dan memenuhi bentuk ini.
export type PlatformIcon = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

export type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "shopee"
  | "website"
  | "catalog"
  | "facebook"
  | "youtube"
  | "whatsapp"
  | "other";

export type SocialLink = {
  id: string;
  platform: SocialPlatform;
  // Cuma dipakai (dan wajib diisi owner) kalau platform === "other" -
  // supaya tombolnya tidak cuma tertulis "Lainnya" di halaman pelanggan.
  label?: string | null;
  url: string;
  // Ikon custom hasil upload sendiri (opsional) - kalau diisi, ini
  // dipakai GANTI ikon bawaan platform di atas (mis. owner mau pakai
  // logo toko sendiri, bukan ikon Instagram generik). URL Cloudinary,
  // sama seperti logo_url/cover_image_url toko.
  icon_url?: string | null;
  // Override manual owner untuk kelompok tampilan (pill panjang di
  // atas / ikon kecil di bawah). Kalau null/kosong, ikut default
  // platform-nya (lihat isSocialIconPlatform) - owner cuma perlu isi
  // ini kalau mau MEMAKSA beda dari default itu.
  display_group?: "main" | "icon" | null;
};

export const SOCIAL_PLATFORM_META: Record<
  SocialPlatform,
  { label: string; icon: PlatformIcon; color: string; placeholder: string }
> = {
  instagram: {
    label: "Instagram",
    icon: InstagramIcon,
    color: "#C13584",
    placeholder: "https://instagram.com/nama-toko",
  },
  tiktok: {
    label: "TikTok",
    icon: TikTokIcon,
    color: "#000000",
    placeholder: "https://tiktok.com/@nama-toko",
  },
  shopee: {
    label: "Shopee",
    icon: ShopeeIcon,
    color: "#EE4D2D",
    placeholder: "https://shopee.co.id/nama-toko",
  },
  website: {
    label: "Website",
    icon: GlobeSolidIcon,
    color: "#0E7C86",
    placeholder: "https://tokokamu.com",
  },
  catalog: {
    label: "Katalog Produk",
    icon: ProductsSolidIcon,
    color: "#B45309",
    placeholder: "https://drive.google.com/... atau link katalog PDF",
  },
  facebook: {
    label: "Facebook",
    icon: FacebookIcon,
    color: "#1877F2",
    placeholder: "https://facebook.com/nama-toko",
  },
  youtube: {
    label: "YouTube",
    icon: YouTubeIcon,
    color: "#FF0000",
    placeholder: "https://youtube.com/@nama-toko",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: WhatsAppIcon,
    color: "#25D366",
    placeholder: "08123456789 (cukup nomor saja)",
  },
  other: {
    label: "Lainnya",
    icon: LinkSolidIcon,
    color: "#132320",
    placeholder: "https://...",
  },
};

export const SOCIAL_PLATFORM_ORDER: SocialPlatform[] = [
  "instagram",
  "tiktok",
  "shopee",
  "website",
  "catalog",
  "facebook",
  "youtube",
  "whatsapp",
  "other",
];

// Platform yang dianggap "akun media sosial" - ditampilkan sebagai
// baris ikon kecil bulat di BAWAH (ala Linktree: Facebook/Instagram/
// TikTok/dst berjejer kecil di bawah daftar tombol utama). Sisanya
// (website, katalog, shopee, lainnya) dianggap "tautan konten/CTA" -
// ditampilkan sebagai pill besar di ATAS supaya lebih menonjol, karena
// biasanya itu yang paling ingin didorong owner (katalog produk, promo,
// toko online) dibanding sekadar akun sosial.
const SOCIAL_ICON_ROW_PLATFORMS: ReadonlySet<SocialPlatform> = new Set([
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "whatsapp",
]);

export function isSocialIconPlatform(platform: SocialPlatform): boolean {
  return SOCIAL_ICON_ROW_PLATFORMS.has(platform);
}

// Kelompok tampilan tautan ini SEBENARNYA - pakai override owner
// (display_group) kalau diisi, kalau tidak baru fallback ke default
// bawaan platform-nya.
export function resolveDisplayGroup(link: SocialLink): "main" | "icon" {
  if (link.display_group === "main" || link.display_group === "icon") {
    return link.display_group;
  }
  return isSocialIconPlatform(link.platform) ? "icon" : "main";
}

// Pisahkan array tautan jadi 2 kelompok sesuai resolveDisplayGroup di
// atas, sambil tetap menjaga urutan asli di masing-masing kelompok.
export function splitSocialLinksByGroup(links: SocialLink[]): {
  mainLinks: SocialLink[];
  iconLinks: SocialLink[];
} {
  const mainLinks: SocialLink[] = [];
  const iconLinks: SocialLink[] = [];
  for (const link of links) {
    if (resolveDisplayGroup(link) === "icon") {
      iconLinks.push(link);
    } else {
      mainLinks.push(link);
    }
  }
  return { mainLinks, iconLinks };
}

// Dipakai buat kasih id unik ke row baru di form dashboard (cukup
// unik di sisi client, tidak perlu UUID beneran - tidak disimpan
// terpisah, cuma properti dalam 1 array JSON).
export function newSocialLinkId(): string {
  return `sl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Label yang ditampilkan ke pelanggan: pakai label custom kalau ada
// (khususnya platform "other"), kalau tidak fallback ke label default
// platform-nya.
export function socialLinkDisplayLabel(link: SocialLink): string {
  return link.label?.trim() || SOCIAL_PLATFORM_META[link.platform].label;
}

// ---------------------------------------------------------------
// WhatsApp: owner cukup menulis NOMOR (mis. 0812-3456-7890,
// +62 812 3456 7890, atau 812xxxx). Di sini dirapikan jadi digit
// berawalan kode negara - siap dipakai untuk https://wa.me/<nomor>.
// ---------------------------------------------------------------

/**
 * Rapikan input nomor WhatsApp jadi digit saja berawalan kode negara.
 * Mengembalikan null kalau bukan nomor yang masuk akal (8-15 digit,
 * batas E.164).
 *   "0812-3456-7890"     -> "6281234567890"
 *   "+62 812 3456 7890"  -> "6281234567890"
 *   "62812..." / "812..." -> "62812..."
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    // Sudah format internasional - biarkan.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2); // 0062812... -> 62812...
  } else if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1); // 0812... -> 62812...
  } else if (digits.startsWith("8")) {
    digits = "62" + digits; // 812... -> 62812...
  }
  // selain itu (mis. sudah diawali 62 / kode negara lain): biarkan.

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

// Bentuk isian WhatsApp:
//  - "link"   : sudah berupa link (wa.me, wa.link, api.whatsapp.com,
//               chat.whatsapp.com, domain apa pun) -> DIPERTAHANKAN apa
//               adanya (ditambah https:// kalau belum ada). Ini penting
//               supaya tautan yang sudah tersimpan milik owner lama tidak
//               hilang atau berubah saat mereka menyimpan pengaturan.
//  - "number" : nomor telepon -> dijadikan https://wa.me/<nomor>.
//  - null     : bukan keduanya -> tidak valid.
type WhatsappInput =
  | { kind: "link"; url: string }
  | { kind: "number"; digits: string }
  | null;

/**
 * Perbaiki link wa.me yang nomornya salah format NASIONAL:
 *   https://wa.me/089639434073   -> https://wa.me/6289639434073
 *   https://wa.me/0062896...     -> https://wa.me/62896...
 * wa.me butuh kode negara, jadi link berawalan 0 tidak berfungsi.
 * SENGAJA hanya menangani awalan 0 / 00 (pasti salah). Nomor yang
 * sudah benar (62..., +62..., kode negara lain seperti 86 / 81 / 60)
 * dan bagian ?text=... tidak disentuh sama sekali.
 */
function fixWaMeLeadingZero(url: string): string {
  const m = /^(https?:\/\/wa\.me\/)(\d{8,16})(\/?)(\?.*)?$/i.exec(url);
  if (!m) return url;
  const [, base, digits, slash, query] = m;
  let fixed: string;
  if (digits.startsWith("00")) fixed = digits.slice(2);
  else if (digits.startsWith("0")) fixed = "62" + digits.slice(1);
  else return url;
  if (fixed.length < 8 || fixed.length > 15) return url;
  return `${base}${fixed}${slash}${query ?? ""}`;
}

function classifyWhatsappInput(raw: string): WhatsappInput {
  const v = raw.trim();
  if (!v) return null;

  const hasScheme = /^https?:\/\//i.test(v);
  const withoutScheme = v.replace(/^https?:\/\//i, "");

  // Ada huruf setelah skema -> pasti link (wa.link/xyz, web.whatsapp.com/...).
  // Tanpa huruf (mis. "https://08123456789", sisa bug lama) -> nomor.
  if (hasScheme && /[a-z]/i.test(withoutScheme)) {
    return { kind: "link", url: fixWaMeLeadingZero(v) };
  }

  // Tanpa skema tapi berbentuk domain (wa.link/xyz, wa.me/628...) -> link.
  if (!hasScheme && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v) && /[a-z]/i.test(v)) {
    return { kind: "link", url: fixWaMeLeadingZero(`https://${v}`) };
  }

  const digits = normalizeWhatsappNumber(v);
  return digits ? { kind: "number", digits } : null;
}

/**
 * Untuk TAMPILAN di form: link lama berbentuk https://wa.me/628123...
 * ditampilkan sebagai nomornya saja. Link lain (grup, ?text=, wa.link,
 * dsb.) dikembalikan apa adanya.
 */
export function whatsappDisplayValue(value: string): string {
  const m = /^https?:\/\/wa\.me\/(\d{8,15})\/?$/i.exec(value.trim());
  return m ? m[1] : value;
}

/** true = isian WhatsApp ini bisa disimpan (nomor valid atau link). */
export function isValidWhatsappInput(value: string): boolean {
  if (!value.trim()) return true; // kosong = baris dibuang, bukan error
  return classifyWhatsappInput(value) !== null;
}

// Bersihkan data sebelum disimpan: buang row yang URL-nya kosong, dan
// pastikan URL selalu ada skema (kalau owner ketik tanpa "https://").
// Khusus WhatsApp: nomor biasa diubah jadi https://wa.me/<nomor>;
// isian yang bukan nomor valid dan bukan link WA dibuang.
export function sanitizeSocialLinks(links: SocialLink[]): SocialLink[] {
  return links.flatMap((link): SocialLink[] => {
    const url = link.url.trim();
    if (!url) return [];

    if (link.platform === "whatsapp") {
      const parsed = classifyWhatsappInput(url);
      if (!parsed) return [];
      return [
        {
          ...link,
          url:
            parsed.kind === "number"
              ? `https://wa.me/${parsed.digits}`
              : parsed.url,
        },
      ];
    }

    return [
      { ...link, url: /^https?:\/\//i.test(url) ? url : `https://${url}` },
    ];
  });
}
