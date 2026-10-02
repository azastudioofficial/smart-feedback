"use client";
// app/feedback/[id]/feedback-card.tsx
//
// Header punya 2 mode, tergantung apakah owner sudah upload
// "Foto Sampul" di Pengaturan Toko:
//
// 1. ADA cover_image_url -> banner foto lebar dengan wave divider di
//    bawahnya, logo/ikon menumpuk persis di batas foto & konten putih
//    (pola profil toko ala Instagram/e-commerce).
// 2. TIDAK ADA cover_image_url -> tampilan lama tetap dipakai (logo
//    dengan efek glow, atau header teks polos kalau logo juga belum
//    ada) - supaya toko yang baru aktivasi tidak pernah terlihat
//    "kosong/rusak" hanya karena belum sempat upload foto sampul.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  MapPin,
  MessageSquareCheck,
  Loader2,
  ChevronLeft,
  ImagePlus,
  X,
  ShieldCheck,
  CheckCircle2,
  Store,
  Star,
  ArrowRight,
  ChevronRight,
  ArrowUpRight,
  Heart,
} from "lucide-react";
import {
  compressComplaintPhoto,
  uploadToCloudinaryWithProgress,
  cloudinaryThumbnail,
} from "@/lib/utils";
import { submitFeedback, logPositiveClick } from "./actions";
import {
  SOCIAL_PLATFORM_META,
  socialLinkDisplayLabel,
  splitSocialLinksByGroup,
  type SocialLink,
} from "@/lib/social-links";

type Product = {
  id: string;
  business_name: string | null;
  google_review_url: string | null;
  logo_url: string | null;
  cover_image_url?: string | null;
  cover_position?: string | null;
  social_links?: SocialLink[] | null;
};

// Kartu aksi bergaya premium: tile ikon besar, judul + deskripsi, "chip"
// kecil penanda manfaat, dan tombol panah bulat di kanan. Warna tiap
// kartu ditentukan 1 warna aksen - semua turunannya (latar, border, tile,
// chip) dibuat dengan color-mix dari warna itu, jadi kartu review otomatis
// ikut warna brand toko sementara kartu lain tetap punya identitas sendiri.
function ActionCard({
  onClick,
  accent,
  icon,
  title,
  description,
  chip,
  ariaHaspopup,
  busy = false,
  variant = "secondary",
  enterDelay = 0,
}: {
  onClick: () => void;
  accent: string;
  icon: ReactNode;
  title: string;
  description: string;
  chip: ReactNode;
  ariaHaspopup?: "dialog";
  /** true = sedang memproses (tombol dikunci + panah jadi spinner). */
  busy?: boolean;
  /** primary = solid warna brand (aksi utama), secondary = putih bergaris. */
  variant?: "primary" | "secondary";
  /** Jeda (ms) animasi muncul - dipakai untuk urutan muncul berjenjang. */
  enterDelay?: number;
}) {
  const primary = variant === "primary";
  // Warna teks di atas warna brand (putih, atau gelap kalau brand-nya
  // terang) - dihitung di page.tsx supaya selalu terbaca.
  const onBrand = "var(--on-brand, #ffffff)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-haspopup={ariaHaspopup}
      className={`page-enter group relative block w-full overflow-hidden rounded-[20px] p-4 [@media(min-height:820px)]:p-[18px] [-webkit-tap-highlight-color:transparent] text-left transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        primary ? "" : "bg-white ring-1 ring-black/[0.07] hover:ring-black/[0.14]"
      }`}
      style={{
        animationDelay: `${enterDelay}ms`,
        ...(primary
          ? {
              background: `linear-gradient(145deg, ${accent}, color-mix(in srgb, ${accent} 76%, black))`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 20px 34px -20px color-mix(in srgb, ${accent} 85%, transparent)`,
            }
          : {
              boxShadow:
                "0 1px 2px rgba(19,35,32,0.04), 0 14px 26px -22px rgba(19,35,32,0.4)",
            }),
      }}
    >
      {/* Kilau lembut di pojok kanan atas kartu utama - memberi kesan
          permukaan bercahaya, bukan blok warna datar. */}
      {primary && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/[0.16] blur-2xl"
        />
      )}
      <span className="relative flex items-center gap-3.5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
          style={
            primary
              ? {
                  backgroundColor: `color-mix(in srgb, ${onBrand} 16%, transparent)`,
                  color: onBrand,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${onBrand} 22%, transparent)`,
                }
              : {
                  backgroundColor: `color-mix(in srgb, ${accent} 11%, white)`,
                  color: accent,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 14%, white)`,
                }
          }
        >
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className="block text-[15px] font-semibold leading-snug tracking-[-0.01em]"
            style={{ color: primary ? onBrand : "#132320" }}
          >
            {title}
          </span>
          <span
            className="mt-0.5 block text-[12.5px] leading-[1.45]"
            style={{
              color: primary
                ? `color-mix(in srgb, ${onBrand} 84%, transparent)`
                : "rgba(19,35,32,0.7)",
            }}
          >
            {description}
          </span>
        </span>

        {/* Tombol panah di baris atas (bukan di dasar kartu) - menghemat
            tinggi kartu supaya dua pilihan + Connect With Us muat dalam
            satu layar HP tanpa scroll. */}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none"
          style={
            primary
              ? { backgroundColor: onBrand, color: "var(--brand)" }
              : { backgroundColor: accent, color: "#ffffff" }
          }
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </span>
      </span>

      {/* Baris keterangan tujuan - hanya di layar yang cukup tinggi
          (desktop/tablet/HP sangat tinggi). Di HP umumnya disembunyikan
          karena judul + deskripsi sudah menjelaskan tujuannya. */}
      <span
        className="relative mt-3 hidden w-full items-center gap-2 border-t pt-2.5 text-[12px] font-medium [@media(min-height:820px)]:flex"
        style={{
          color: primary ? onBrand : "rgba(19,35,32,0.75)",
          borderColor: primary
            ? `color-mix(in srgb, ${onBrand} 22%, transparent)`
            : "rgba(19,35,32,0.07)",
        }}
      >
        {chip}
      </span>
    </button>
  );
}

// "Terhubung dengan Kami" - dibuat sebagai BOTTOM SHEET (panel yang
// meluncur naik dari bawah, menutupi sebagian layar), bukan accordion
// kecil di dalam kartu. Pola ini yang dipakai Linktree/Instagram "Link
// in Bio": tombol pemicu tetap kecil di footer kartu, tapi begitu
// diklik, yang terbuka adalah panel penuh dengan foto profil toko di
// atas + daftar tautan sebagai pill panjang (bukan bubble kecil) -
// jauh lebih nyaman disentuh jarinya (target sentuh lebih besar) dan
// lebih mudah dibaca labelnya dibanding grid ikon kecil.
//
// Kalau toko belum isi tautan apapun di Pengaturan, komponen ini
// sengaja tidak me-render apapun (return null) supaya kartu tidak
// terlihat ada bagian kosong/rusak.
//
// Catatan performa (tetap dipertahankan dari versi sebelumnya):
// 1. hasOpened - daftar link (termasuk gambar ikon custom) BARU
//    di-render begitu pelanggan pertama kali membuka sheet-nya, bukan
//    langsung ikut dimuat begitu halaman feedback dibuka. Mayoritas
//    pelanggan tidak pernah buka bagian ini sama sekali.
// 2. Sekali dibuka, hasOpened TETAP true - tutup/buka berikutnya
//    instan (gambar sudah di-cache browser), tidak "loading ulang".
// 3. Ikon custom lewat cloudinaryThumbnail() - yang didownload versi
//    kecil terkompresi, bukan file asli hasil upload owner.
//
// Catatan aksesibilitas & kenyamanan akses:
// - Body di-lock scroll-nya selagi sheet terbuka (biar halaman di
//   belakang tidak ikut geser).
// - Tombol Escape & tap di area gelap (backdrop) menutup sheet -
//   bukan cuma tombol X, supaya nyaman dipakai dengan cara apapun.
// - Target sentuh tiap pill setinggi 56px (h-14) - di atas standar
//   minimum 44px yang direkomendasikan Apple/Google buat elemen yang
//   nyaman disentuh jari, khususnya buat pelanggan yang lagi berdiri/
//   buru-buru di toko (bukan duduk santai pegang HP).
function ConnectWithUs({
  links,
  product,
}: {
  links: SocialLink[];
  product: Product;
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Lock scroll body + tutup pakai tombol Escape - standar UX bottom
  // sheet di app native maupun web modern.
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    // Fokus pindah ke tombol tutup begitu sheet terbuka (pembaca layar &
    // keyboard tablet), lalu balik ke tombol pemicu waktu ditutup.
    closeBtnRef.current?.focus();
    const toRestore = returnFocusRef.current;
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      toRestore?.focus?.();
    };
  }, [open]);

  if (!links || links.length === 0) return null;

  const { mainLinks, iconLinks } = splitSocialLinksByGroup(links);

  function handleOpen() {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    setHasOpened(true);
  }

  return (
    <>
      {/* Tombol pemicu - sengaja BARIS RAMPING (bukan kartu besar ketiga)
          supaya hirarkinya jelas: 2 aksi utama di atas, ini pelengkap.
          Tumpukan ikon platform memberi bocoran isi sheet. Hanya ikon
          bawaan (bukan ikon custom) agar gambar custom tetap dimuat
          malas, baru setelah sheet dibuka. Judul & deskripsi mengikuti
          tautan yang BENAR-BENAR diisi owner. */}
      <button
        type="button"
        onClick={handleOpen}
        aria-haspopup="dialog"
        style={{ animationDelay: "280ms" }}
        className="page-enter group mt-3 flex w-full items-center gap-3.5 rounded-[18px] bg-[#F6F8F7] [-webkit-tap-highlight-color:transparent] px-4 py-2.5 text-left ring-1 ring-black/[0.05] transition-all duration-300 hover:bg-white hover:ring-black/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] active:scale-[0.99] motion-reduce:transition-none"
      >
        <span className="flex shrink-0 -space-x-2" aria-hidden="true">
          {[...mainLinks, ...iconLinks].slice(0, 4).map((l) => {
            const meta = SOCIAL_PLATFORM_META[l.platform];
            const Icon = meta.icon;
            return (
              <span
                key={l.id}
                className="flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-[#F6F8F7] transition-all duration-300 group-hover:ring-white"
                style={{
                  backgroundColor: `color-mix(in srgb, ${meta.color} 14%, white)`,
                }}
              >
                <Icon className="h-4 w-4" style={{ color: meta.color }} />
              </span>
            );
          })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-[#132320]">
            {mainLinks.length > 0 ? "Lihat Menu & Katalog" : "Ikuti Kami"}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-[#132320]/68">
            {mainLinks.length > 0
              ? "Jelajahi menu, produk, dan promo menarik kami."
              : "Temukan kami di media sosial untuk info dan promo terbaru."}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#132320]/30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[#132320]/60 motion-reduce:transition-none" />
      </button>

      {/* Backdrop gelap di belakang sheet - tap di sini juga menutup */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 touch-none bg-[#0B1512]/55 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sheet - meluncur naik dari bawah layar */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Terhubung dengan Kami"
        aria-hidden={!open}
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in srgb, var(--brand) 9%, white), white 200px)",
        }}
        // inert: selagi tertutup (di luar layar) isinya tidak bisa
        // difokus lewat Tab & tidak dibaca pembaca layar.
        inert={!open}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-sm flex-col md:max-w-md rounded-t-[28px] bg-white shadow-[0_-20px_60px_-15px_rgba(19,35,32,0.35)] transition-transform duration-[380ms] ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Drag handle - hint visual "bisa ditutup", walau interaksi
            utamanya tetap lewat tombol X / backdrop / Escape. */}
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-[#132320]/15" />
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Tutup"
          className="absolute right-2.5 top-2 flex h-11 w-11 items-center justify-center rounded-full text-[#132320]/62 transition hover:bg-[#132320]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] active:scale-90"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-1">
          {/* Header profil - foto sampul ala Linktree: pakai logo toko
              yang sama dengan di kartu utama, biar konsisten identitas
              (bukan foto sampul lebar - avatar bundar lebih pas untuk
              pola "profile card" seperti ini). */}
          <div className="flex flex-col items-center pb-5 pt-2 text-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-white shadow-md ring-2 ring-[var(--brand)]/20">
              {product.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cloudinaryThumbnail(product.logo_url, "f_auto,q_auto,w_160")}
                  alt={product.business_name ?? "Logo toko"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--brand), var(--brand-dark))",
                  }}
                >
                  <Store className="h-6 w-6 text-white" />
                </div>
              )}
            </div>
            <p
              className="mt-2.5 text-[14px] font-bold text-[#132320]"
              style={DISPLAY}
            >
              {product.business_name}
            </p>
            <p className="mt-0.5 text-[11.5px] text-[#132320]/62">
              Terhubung dengan Kami
            </p>
          </div>

          {/* Kelompok 1: tautan non-sosial (website/katalog/shopee/
              lainnya) - pill panjang 1 kolom penuh, label selalu
              terbaca lengkap, target sentuh besar & nyaman. Ini yang
              paling ingin ditonjolkan owner (katalog, promo, toko
              online), makanya ditaruh paling atas & paling besar. */}
          {mainLinks.length > 0 && (
            <div className="space-y-3">
              {hasOpened &&
                mainLinks.map((link, idx) => {
                  const meta = SOCIAL_PLATFORM_META[link.platform];
                  const Icon = meta.icon;
                  const hasCustomIcon = Boolean(link.icon_url);
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group relative flex h-14 w-full items-center justify-center rounded-2xl border border-black/[0.05] bg-[#F6F8F7] shadow-[0_1px_2px_rgba(19,35,32,0.04)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[var(--brand)]/25 hover:bg-white hover:shadow-[0_12px_24px_-12px_rgba(19,35,32,0.2)] active:scale-[0.98] ${
                        open
                          ? "translate-y-0 opacity-100"
                          : "translate-y-2 opacity-0"
                      }`}
                      style={{ transitionDelay: open ? `${idx * 50}ms` : "0ms" }}
                    >
                      <span
                        className="absolute left-2 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-105"
                        style={{
                          backgroundColor: hasCustomIcon
                            ? "white"
                            : `color-mix(in srgb, ${meta.color} 14%, white)`,
                        }}
                      >
                        {hasCustomIcon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cloudinaryThumbnail(link.icon_url!, "f_auto,q_auto,w_100")}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <Icon
                            className="h-[18px] w-[18px]"
                            style={{ color: meta.color }}
                          />
                        )}
                      </span>
                      <span className="line-clamp-1 px-14 text-[13px] font-semibold text-[#132320] transition-colors group-hover:text-[var(--brand-dark)]">
                        {socialLinkDisplayLabel(link)}
                      </span>
                      <ArrowUpRight className="absolute right-4 h-4 w-4 text-[#132320]/25 transition-colors group-hover:text-[var(--brand-dark)]" />
                    </a>
                  );
                })}
            </div>
          )}

          {/* Kelompok 2: akun media sosial (Instagram/TikTok/Facebook/
              YouTube/WhatsApp) - baris ikon bulat kecil berjejer di
              BAWAH, persis pola Linktree. Cuma ikon (tanpa label
              teks di bawahnya) karena platform-nya sudah umum
              dikenali dari bentuk ikonnya saja. */}
          {iconLinks.length > 0 && (
            <div
              className={`flex flex-wrap items-center justify-center gap-3 ${
                mainLinks.length > 0 ? "mt-5 border-t border-black/[0.06] pt-5" : ""
              }`}
            >
              {hasOpened &&
                iconLinks.map((link, idx) => {
                  const meta = SOCIAL_PLATFORM_META[link.platform];
                  const Icon = meta.icon;
                  const hasCustomIcon = Boolean(link.icon_url);
                  const delayIdx = mainLinks.length + idx;
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={socialLinkDisplayLabel(link)}
                      aria-label={socialLinkDisplayLabel(link)}
                      className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-[0_1px_2px_rgba(19,35,32,0.04)] ring-1 ring-black/[0.05] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_rgba(19,35,32,0.25)] active:scale-90 ${
                        open
                          ? "translate-y-0 opacity-100"
                          : "translate-y-2 opacity-0"
                      }`}
                      style={{
                        transitionDelay: open ? `${delayIdx * 50}ms` : "0ms",
                        backgroundColor: hasCustomIcon
                          ? "white"
                          : `color-mix(in srgb, ${meta.color} 14%, white)`,
                      }}
                    >
                      {hasCustomIcon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cloudinaryThumbnail(link.icon_url!, "f_auto,q_auto,w_100")}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain p-1.5 transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <Icon
                          className="h-[19px] w-[19px] transition-transform duration-300 group-hover:scale-110"
                          style={{ color: meta.color }}
                        />
                      )}
                    </a>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Font pairing ala app premium (Linear/Stripe/Typeform): Space
// Grotesk ("--font-display") CUMA dipakai untuk 2 elemen identitas -
// eyebrow label & nama toko. Semua teks fungsional lainnya (subtitle,
// isi tombol, label form, teks bantuan) pakai Inter ("--font-admin-body")
// yang lebih netral & lebih gampang dibaca di ukuran kecil.
const BODY = { fontFamily: "var(--font-admin-body)" };
const DISPLAY = { fontFamily: "var(--font-display)" };

// Baris "Pelayanan Terbaik / Kualitas Terjamin / Kepuasan Pelanggan".
// Dimatikan karena itu klaim umum atas nama toko dan bersaing dengan 2
// aksi utama. Ubah ke true untuk menampilkannya lagi.
const SHOW_VALUES = false;

// Satu baris ucapan terima kasih yang tenang di dasar kartu. Ubah ke
// false kalau footer mau sepenuhnya tanpa tulisan (garis + kilau saja).
const SHOW_FOOTER_THANKS = true;

// Kalau toko belum upload logo, tampilkan monogram dari nama toko
// (2 huruf pertama) dengan gradient warna brand - lebih personal &
// elegan dibanding placeholder generik.
function getInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Mode TANPA cover: logo asli dibungkus efek glow di belakangnya. Kalau
// belum ada logo SAMA SEKALI, sengaja tidak render apapun - header
// murni tipografi (lihat CardHeader di bawah), BUKAN inisial huruf.
function BrandMarkGlow({ product }: { product: Product }) {
  if (!product.logo_url) return null;

  return (
    <div className="relative mx-auto h-12 w-12">
      <div
        className="absolute inset-0 rounded-xl opacity-50 blur-lg"
        style={{
          background: "linear-gradient(135deg, var(--brand), var(--brand-dark))",
        }}
      />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-black/[0.06] bg-white p-1 shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.logo_url ? cloudinaryThumbnail(product.logo_url, "f_auto,q_auto,w_120") : undefined}
          alt={product.business_name ?? "Logo toko"}
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  );
}

// Logo Google 4-warna resmi - dipakai untuk menandai tombol "Tulis
// Review di Google" biar jelas & familiar buat pelanggan (pola yang
// sama dipakai hampir semua tombol "Login/Review dengan Google").
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8.1 3l6-6C34.5 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3.1 0 5.9 1.1 8.1 3l6-6C34.5 5.1 29.6 3 24 3 16.3 3 9.7 7.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.7 35.9 27 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 40.6 16.2 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.6C41.9 36.6 45 30.9 45 24c0-1.4-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

// Mode DENGAN cover: avatar yang "menumpuk" di batas banner & konten.
// Kalau logo belum ada, dipakai ikon toko netral (BUKAN inisial huruf -
// beda dari mode tanpa cover, karena di sini slot avatar-nya memang
// wajib ada secara struktural, jadi placeholder-nya sengaja generik/
// ikon, bukan kesan "identitas" seperti inisial nama).
function OverlapAvatar({ product }: { product: Product }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] border-[3px] border-white bg-white shadow-[0_10px_24px_-8px_rgba(19,35,32,0.4)] ring-2 ring-[var(--brand)]/20">
      {product.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.logo_url ? cloudinaryThumbnail(product.logo_url, "f_auto,q_auto,w_120") : undefined}
          alt={product.business_name ?? "Logo toko"}
          className="h-full w-full object-contain"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, var(--brand), var(--brand-dark))",
          }}
        >
          <Store className="h-6 w-6 text-white" />
        </div>
      )}
    </div>
  );
}

export function FeedbackCard({ product }: { product: Product }) {
  const [step, setStep] = useState<"choice" | "form">("choice");
  const [customerName, setCustomerName] = useState("");
  const [complaintText, setComplaintText] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sentAnonymously, setSentAnonymously] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasCover = Boolean(product.cover_image_url);
  const hasLogo = Boolean(product.logo_url);

  // Preview thumbnail foto bukti - dibuat dari File asli (sebelum
  // dikompres), object URL di-revoke otomatis tiap kali file ganti.
  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // iOS Safari memulihkan halaman dari cache saat pelanggan menekan
  // "Kembali" dari Google Maps - tanpa ini tombol tetap terkunci
  // berputar karena state "reviewing" ikut dibekukan.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setReviewing(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function handleSatisfied() {
    // Kunci tombol: tap ganda tidak lagi mencatat klik berkali-kali
    // (angka "Klik Review" di dashboard owner jadi lebih jujur).
    if (reviewing) return;
    setReviewing(true);

    // Pencatatan klik dibatasi maks 1,2 detik - jaringan lambat tidak
    // boleh menahan pelanggan yang cuma ingin menulis review.
    await Promise.race([
      logPositiveClick(product.id).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);

    if (product.google_review_url) {
      window.location.href = product.google_review_url;
    } else {
      setReviewing(false);
    }
  }

  async function handleSubmitComplaint() {
    setError(null);

    if (!complaintText.trim()) {
      setError("Mohon isi pesan Anda.");
      return;
    }

    setLoading(true);
    setProgress(0);

    try {
      let photoUrl: string | null = null;

      if (photoFile) {
        setProgress(10);
        const compressed = await compressComplaintPhoto(photoFile);
        setProgress(25);

        // Progress ASLI dari network upload, bukan animasi tebakan.
        photoUrl = await uploadToCloudinaryWithProgress(
          compressed,
          (uploadPercent) => {
            setProgress(25 + Math.round((uploadPercent / 100) * 65));
          }
        );
      }

      setProgress(92);
      const result = await submitFeedback({
        productId: product.id,
        customerName: customerName || undefined,
        complaintText,
        photoUrl,
        anonymous,
      });

      if (!result.success) {
        setError(result.error ?? "Gagal mengirim pesan.");
        setLoading(false);
        setProgress(0);
        return;
      }

      setProgress(100);

      // Kirim anonim: TIDAK redirect ke WhatsApp, cukup tampilkan
      // konfirmasi sukses di halaman ini saja.
      if (result.anonymous) {
        setSentAnonymously(true);
        setLoading(false);
        return;
      }

      if (!result.whatsappUrl) {
        setError(result.error ?? "Gagal mengirim pesan.");
        setLoading(false);
        setProgress(0);
        return;
      }

      window.location.href = result.whatsappUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setLoading(false);
      setProgress(0);
    }
  }

  const eyebrowTopClass = hasCover ? "mt-0" : hasLogo ? "mt-3" : "mt-0";
  const headerTopClass = hasCover ? "pt-10" : hasLogo ? "pt-6" : "pt-5";

  return (
    <div
      className="flex w-full animate-in fade-in slide-in-from-bottom-3 flex-col duration-500 motion-reduce:animate-none sm:w-[24rem] md:w-[28rem]"
      style={BODY}
    >
      <Card
        // Di HP: kartu memenuhi layar (tanpa bingkai/bayangan) seperti
        // aplikasi native. Mulai layar >= sm (tablet/desktop): kembali
        // jadi kartu melayang dengan sudut membulat dan bayangan.
        className={`relative flex-1 overflow-hidden rounded-none border-black/[0.04] bg-white ring-0 sm:flex-none sm:rounded-xl sm:ring-1 sm:shadow-[0_1px_2px_rgba(19,35,32,0.04),0_35px_70px_-25px_rgba(19,35,32,0.38)] ${
          hasCover ? "pb-0 pt-0" : "pb-0"
        } gap-3!`}
      >
        {!hasCover && (
          // Aksen gradient tipis di tepi atas - cuma dipakai kalau
          // TIDAK ada banner foto (kalau ada banner, banner itu
          // sendiri sudah jadi "pernyataan brand" di atas).
          <div
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              background:
                "linear-gradient(90deg, var(--brand), var(--brand-dark))",
            }}
          />
        )}

        {hasCover && (
          <div className="relative">
            <div className="relative h-40 w-full sm:h-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.cover_image_url ? cloudinaryThumbnail(product.cover_image_url, "f_auto,q_auto,w_800") : undefined}
                alt=""
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: product.cover_position || "50% 50%" }}
              />
              {/* Overlay di-tint pakai warna brand toko sendiri (bukan
                  hitam netral) - supaya foto APAPUN yang diupload owner
                  tetap "terasa" warna identitas mereka. */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, color-mix(in srgb, var(--brand-dark) 55%, black 35%) 0%, transparent 65%)",
                }}
              />

              {/* Wave divider - 1 lengkungan tunggal dari ujung ke
                  ujung, plus 1 garis tipis SAMAR persis di bawahnya
                  (echo line) sebagai aksen halus. */}
              <svg
                className="absolute inset-x-0 bottom-0 h-6 w-full"
                viewBox="0 0 100 16"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M0,0 Q50,24 100,0 L100,16 L0,16 Z"
                  className="fill-white"
                />
                <path
                  d="M0,2 Q50,26 100,2"
                  fill="none"
                  className="stroke-white/40"
                  strokeWidth="1"
                />
              </svg>
            </div>

            {/* Avatar menumpuk persis di batas banner & konten - separuh
                di atas foto, separuh di atas konten putih. Ukuran &
                overlap dikecilin (dari 72px/-9 jadi 56px/-7) khusus
                buat muat 1 layar HP tanpa scroll. */}
            <div className="absolute inset-x-0 -bottom-8 flex justify-center">
              <OverlapAvatar product={product} />
            </div>
          </div>
        )}

        <CardHeader
          className={`flex flex-col items-center px-6 text-center sm:px-9 ${headerTopClass}`}
        >
          {!hasCover && <BrandMarkGlow product={product} />}

          <p
            className={`text-[12.5px] font-medium text-[#132320]/62 [@media(max-height:620px)]:hidden ${eyebrowTopClass}`}
            style={BODY}
          >
            Terima kasih sudah berkunjung
          </p>
          <h1
            className="mt-1.5 max-w-full text-balance break-words text-[27px] font-bold leading-[1.15] tracking-[-0.025em] text-[#132320]"
            style={DISPLAY}
          >
            {product.business_name}
          </h1>

          {/* Aksen kecil warna brand di bawah nama toko - cuma muncul
              waktu ada cover, karena di mode ini warna brand nggak
              otomatis "terlihat" duluan (fotonya bisa warna apa saja).
              Tanpa cover, logo/eyebrow di atas sudah cukup jadi
              pernyataan warna brand. */}
          {hasCover && (
            <div
              className="mt-1.5 h-[3px] w-7 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--brand), var(--brand-dark))",
              }}
            />
          )}

          {/* Pertanyaan hanya di langkah pilihan. Di langkah form, judul
              "Hubungi Layanan Pelanggan" sudah menjelaskan konteksnya -
              tanpa ini judulnya tampil dobel. */}
          {step === "choice" && (
            <>
              <p className="mt-3.5 text-[17px] font-semibold tracking-[-0.015em] text-[#132320] [@media(min-height:820px)]:mt-6">
                Bagaimana pengalaman Anda hari ini?
              </p>
              <p className="mx-auto mt-1 max-w-[270px] text-pretty text-[12.5px] leading-relaxed text-[#132320]/68 [@media(max-height:660px)]:hidden">
                Kami selalu ingin memberikan yang terbaik untuk Anda.
              </p>
            </>
          )}

          {/* 3 nilai layanan - hanya di langkah pilihan (di langkah
              form dibuang biar ruang untuk mengetik lebih lega).
              Teksnya sengaja umum supaya cocok untuk semua jenis usaha. */}
          {step === "choice" && SHOW_VALUES ? (
            <div className="mt-6 grid w-full grid-cols-3 divide-x divide-black/[0.07]">
              {[
                { icon: ShieldCheck, top: "Pelayanan", bottom: "Terbaik" },
                { icon: Star, top: "Kualitas", bottom: "Terjamin" },
                { icon: Heart, top: "Kepuasan", bottom: "Pelanggan" },
              ].map(({ icon: Icon, top, bottom }) => (
                <div
                  key={top}
                  className="flex flex-col items-center gap-2 px-2"
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "var(--brand)" }}
                    strokeWidth={1.6}
                  />
                  <span className="text-center text-[11px] font-medium leading-snug text-[#132320]/65">
                    {top}
                    <br />
                    {bottom}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              className={`mt-5 h-px w-10 bg-[#132320]/10 ${
                step === "choice" ? "hidden [@media(min-height:820px)]:block" : ""
              }`}
            />
          )}
        </CardHeader>

        <CardContent className="px-4 pb-4 min-[400px]:px-5 sm:px-6">
          {step === "choice" && (
            <div className="space-y-2.5">
              <ActionCard
                onClick={handleSatisfied}
                busy={reviewing}
                variant="primary"
                enterDelay={120}
                accent="var(--brand)"
                icon={<MapPin className="h-6 w-6" />}
                title="Bagikan Pengalaman Anda"
                description="Bantu bisnis kami berkembang dengan ulasan di Google Maps."
                chip={
                  <>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                      <GoogleIcon className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 truncate">Tulis Review di Google Maps</span>
                  </>
                }
              />

              <ActionCard
                onClick={() => setStep("form")}
                enterDelay={200}
                accent="#2F7D5B"
                icon={<MessageSquareCheck className="h-6 w-6" />}
                title="Hubungi Layanan Pelanggan"
                description="Dapatkan bantuan cepat atau solusi masalah."
                chip={
                  <>
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: "#2F7D5B" }}
                    >
                      <ShieldCheck className="h-2.5 w-2.5" />
                    </span>
                    <span className="min-w-0 truncate">Hubungi Owner / Customer Service</span>
                  </>
                }
              />
            </div>
          )}

          {step === "form" && (
            <div className="space-y-5 border-t border-black/[0.06] pt-5">
              {sentAnonymously ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#F6F8F7] px-5 py-9 text-center">
                  <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_-10px_rgba(19,35,32,0.35)] ring-1 ring-black/[0.05]">
                    <CheckCircle2 className="h-7 w-7 text-[var(--brand)]" />
                  </span>
                  <p className="font-semibold text-[#132320]">
                    Terima kasih atas masukan Anda
                  </p>
                  <p className="text-sm text-[#132320]/68">
                    Laporan Anda sudah kami terima secara anonim dan langsung
                    masuk ke dashboard pemilik toko.
                  </p>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setStep("choice")}
                    disabled={loading}
                    className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-xs font-medium text-[#132320]/62 transition hover:text-[#132320] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Kembali
                  </button>

                  {/* Judul langkah - mengulang nama kartu yang baru
                      diketuk, supaya pelanggan tidak kehilangan konteks. */}
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                      style={{
                        backgroundColor: "color-mix(in srgb, #2F7D5B 12%, white)",
                        color: "#2F7D5B",
                        boxShadow: "inset 0 0 0 1px color-mix(in srgb, #2F7D5B 14%, white)",
                      }}
                    >
                      <MessageSquareCheck className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#132320]">
                        Hubungi Layanan Pelanggan
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#132320]/68">
                        Dapatkan bantuan cepat atau solusi masalah.
                      </p>
                    </div>
                  </div>

                  {!anonymous && (
                    <div className="space-y-1.5">
                      <Label htmlFor="customerName">Nama (Opsional)</Label>
                      <Input
                        id="customerName"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Nama Anda"
                        className="h-12 rounded-xl! border-black/[0.08]! bg-[#F6F8F7]! px-3.5 shadow-none placeholder:text-[#132320]/35 focus-visible:border-[var(--brand)]! focus-visible:bg-white! focus-visible:ring-[var(--brand)]/15! text-base md:text-base"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="complaintText">Pesan / Masukan Anda</Label>
                    <Textarea
                      id="complaintText"
                      rows={4}
                      value={complaintText}
                      onChange={(e) => setComplaintText(e.target.value)}
                      placeholder="Ceritakan pengalaman Anda..."
                      className="min-h-28 py-3 rounded-xl! border-black/[0.08]! bg-[#F6F8F7]! px-3.5 shadow-none placeholder:text-[#132320]/35 focus-visible:border-[var(--brand)]! focus-visible:bg-white! focus-visible:ring-[var(--brand)]/15! text-base md:text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Foto Bukti (Opsional)</Label>
                    {photoPreview ? (
                      <div className="flex items-center gap-3 rounded-xl border border-black/[0.08] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoPreview}
                          alt="Preview foto"
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                        <span className="flex-1 truncate text-xs text-[#132320]/68">
                          {photoFile?.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPhotoFile(null)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#132320]/40 transition hover:bg-black/[0.05] hover:text-[#B5585E]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-black/[0.16] bg-white px-3 py-2.5 text-left transition hover:border-[var(--brand)]/45 hover:bg-[var(--brand)]/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F6F8F7] text-[#132320]/62">
                          <ImagePlus className="h-4 w-4" />
                        </span>
                        <span className="text-[13px] text-[#132320]/68">
                          Ketuk untuk pilih foto
                        </span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        setPhotoFile(e.target.files?.[0] ?? null)
                      }
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-3.5 rounded-2xl bg-[#F6F8F7] px-4 py-3.5 ring-1 ring-black/[0.05] transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)]">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#132320]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Kirim sebagai anonim
                      </span>
                      <span className="mt-1 block text-[12px] leading-relaxed text-[#132320]/68">
                        Nama disembunyikan, laporan langsung masuk ke dashboard
                        pemilik toko tanpa lewat WhatsApp.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={anonymous}
                      onChange={(e) => {
                        setAnonymous(e.target.checked);
                        if (e.target.checked) setCustomerName("");
                      }}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="relative h-6 w-10 shrink-0 rounded-full bg-[#132320]/15 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 peer-checked:bg-[var(--brand)] peer-checked:after:translate-x-4 motion-reduce:transition-none motion-reduce:after:transition-none"
                    />
                  </label>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl bg-[#FCEEF0] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#B5585E]"
                    >
                      {error}
                    </p>
                  )}

                  <Button
                    onClick={handleSubmitComplaint}
                    disabled={loading}
                    className="relative h-[52px] w-full overflow-hidden rounded-2xl bg-[#132320] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_30px_-14px_rgba(19,35,32,0.65)] transition active:scale-[0.99] hover:bg-[#0B1512]"
                  >
                    {loading && (
                      <span
                        className="absolute inset-y-0 left-0 bg-white/15 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    )}
                    <span className="relative flex items-center gap-2 tabular-nums">
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Mengirim... {progress}%
                        </>
                      ) : (
                        "Kirim Masukan"
                      )}
                    </span>
                  </Button>

                  <p className="text-center text-[11.5px] leading-relaxed text-[#132320]/62">
                    Masukan Anda bersifat rahasia &amp; hanya diteruskan
                    kepada pemilik usaha.
                  </p>
                </>
              )}
            </div>
          )}

          {step === "choice" && (
            <ConnectWithUs links={product.social_links ?? []} product={product} />
          )}
        </CardContent>

        {/* Footer: tenang & minimal ala produk SaaS premium. Tidak ada
            ornamen - hanya garis halus yang memudar di kedua ujung
            (dengan satu titik warna brand di tengah), kilau lembut
            warna brand dari dasar kartu, dan satu baris teks kecil.
            Ucapan "Terima kasih sudah berkunjung" sudah ada di bagian
            atas, jadi di sini sengaja tidak diulang dengan huruf besar.
            Padding bawah mengikuti safe-area iPhone supaya tidak
            menempel ke garis indikator Home. */}
        <div
          className="relative mt-auto px-6 pt-9 text-center"
          style={{
            paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))",
            backgroundImage:
              "radial-gradient(120% 100% at 50% 135%, color-mix(in srgb, var(--brand) 13%, white), transparent 68%)",
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-8 top-0 flex items-center justify-center"
          >
            <span
              className="h-px flex-1"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand) 28%, transparent))",
              }}
            />
            <span
              className="mx-3 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--brand)", opacity: 0.55 }}
            />
            <span
              className="h-px flex-1"
              style={{
                backgroundImage:
                  "linear-gradient(270deg, transparent, color-mix(in srgb, var(--brand) 28%, transparent))",
              }}
            />
          </div>

          {SHOW_FOOTER_THANKS && (
            <p className="relative text-[12px] font-medium tracking-[0.01em] text-[#132320]/60">
              Terima kasih atas dukungan Anda
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
