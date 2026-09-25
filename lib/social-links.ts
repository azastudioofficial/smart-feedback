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

import {
  Camera,
  ThumbsUp,
  PlayCircle,
  Globe,
  ShoppingBag,
  BookOpen,
  Music2,
  MessageCircle,
  Link2,
  type LucideIcon,
} from "lucide-react";

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
};

export const SOCIAL_PLATFORM_META: Record<
  SocialPlatform,
  { label: string; icon: LucideIcon; color: string; placeholder: string }
> = {
  instagram: {
    label: "Instagram",
    icon: Camera,
    color: "#C13584",
    placeholder: "https://instagram.com/nama-toko",
  },
  tiktok: {
    label: "TikTok",
    icon: Music2,
    color: "#000000",
    placeholder: "https://tiktok.com/@nama-toko",
  },
  shopee: {
    label: "Shopee",
    icon: ShoppingBag,
    color: "#EE4D2D",
    placeholder: "https://shopee.co.id/nama-toko",
  },
  website: {
    label: "Website",
    icon: Globe,
    color: "#0E7C86",
    placeholder: "https://tokokamu.com",
  },
  catalog: {
    label: "Katalog Produk",
    icon: BookOpen,
    color: "#B45309",
    placeholder: "https://drive.google.com/... atau link katalog PDF",
  },
  facebook: {
    label: "Facebook",
    icon: ThumbsUp,
    color: "#1877F2",
    placeholder: "https://facebook.com/nama-toko",
  },
  youtube: {
    label: "YouTube",
    icon: PlayCircle,
    color: "#FF0000",
    placeholder: "https://youtube.com/@nama-toko",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    color: "#25D366",
    placeholder: "https://wa.me/62812xxxxxxx",
  },
  other: {
    label: "Lainnya",
    icon: Link2,
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

// Pisahkan array tautan jadi 2 kelompok sesuai kategori di atas, sambil
// tetap menjaga urutan asli di masing-masing kelompok.
export function splitSocialLinksByGroup(links: SocialLink[]): {
  mainLinks: SocialLink[];
  iconLinks: SocialLink[];
} {
  const mainLinks: SocialLink[] = [];
  const iconLinks: SocialLink[] = [];
  for (const link of links) {
    if (isSocialIconPlatform(link.platform)) {
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

// Bersihkan data sebelum disimpan: buang row yang URL-nya kosong, dan
// pastikan URL selalu ada skema (kalau owner ketik tanpa "https://").
export function sanitizeSocialLinks(links: SocialLink[]): SocialLink[] {
  return links
    .map((link) => ({ ...link, url: link.url.trim() }))
    .filter((link) => link.url.length > 0)
    .map((link) => ({
      ...link,
      url: /^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`,
    }));
}
