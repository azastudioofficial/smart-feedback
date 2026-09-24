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

import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import {
  compressComplaintPhoto,
  uploadToCloudinaryWithProgress,
  cloudinaryThumbnail,
} from "@/lib/utils";
import { submitFeedback, logPositiveClick } from "./actions";

type Product = {
  id: string;
  business_name: string | null;
  google_review_url: string | null;
  logo_url: string | null;
  cover_image_url?: string | null;
  cover_position?: string | null;
};

// Font pairing ala app premium (Linear/Stripe/Typeform): Space
// Grotesk ("--font-display") CUMA dipakai untuk 2 elemen identitas -
// eyebrow label & nama toko. Semua teks fungsional lainnya (subtitle,
// isi tombol, label form, teks bantuan) pakai Inter ("--font-admin-body")
// yang lebih netral & lebih gampang dibaca di ukuran kecil.
const BODY = { fontFamily: "var(--font-admin-body)" };
const DISPLAY = { fontFamily: "var(--font-display)" };

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
    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-white bg-white shadow-sm ring-2 ring-[var(--brand)]/25">
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

  async function handleSatisfied() {
    await logPositiveClick(product.id);
    if (product.google_review_url) {
      window.location.href = product.google_review_url;
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
  const headerTopClass = hasCover ? "pt-8" : hasLogo ? "pt-6" : "pt-5";

  return (
    <div
      className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-500"
      style={BODY}
    >
      <Card
        className={`relative overflow-hidden border-black/[0.04] bg-white/95 shadow-[0_1px_2px_rgba(19,35,32,0.04),0_35px_70px_-25px_rgba(19,35,32,0.38)] backdrop-blur-xl ${
          hasCover ? "pt-0" : ""
        }`}
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
            <div className="relative h-36 w-full sm:h-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.cover_image_url ? cloudinaryThumbnail(product.cover_image_url, "f_auto,q_auto,w_800") : undefined}
                alt=""
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
            <div className="absolute inset-x-0 -bottom-7 flex justify-center">
              <OverlapAvatar product={product} />
            </div>
          </div>
        )}

        <CardHeader
          className={`flex flex-col items-center px-6 text-center sm:px-9 ${headerTopClass}`}
        >
          {!hasCover && <BrandMarkGlow product={product} />}

          <p
            className={`text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--brand)] ${eyebrowTopClass}`}
            style={DISPLAY}
          >
            Terima kasih sudah berkunjung
          </p>
          <h1
            className="mt-1 text-xl font-bold leading-[1.15] tracking-tight text-[#132320]"
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

          <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#132320]">
            Bagaimana Pengalaman Anda Hari Ini?
          </p>
          <p className="mx-auto mt-1 max-w-[240px] text-[12px] leading-snug text-[#132320]/50">
            Kami selalu ingin memberikan yang terbaik untuk Anda.
          </p>

          {/* Garis pemisah tipis - jadi jangkar visual pengganti logo
              waktu toko belum upload logo/cover, sekaligus penegas
              transisi ke bagian pilihan di bawah. */}
          <div className="mt-3 h-px w-10 bg-[#132320]/10" />
        </CardHeader>

        <CardContent className="px-5 pb-4 sm:px-6">
          {step === "choice" && (
            <div className="space-y-2.5">
              <button
                onClick={handleSatisfied}
                className="group flex w-full flex-col gap-2.5 rounded-2xl p-3 text-left transition hover:-translate-y-0.5"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--brand) 7%, white)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm transition group-hover:scale-105"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--brand) 15%, white)",
                      color: "var(--brand)",
                    }}
                  >
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold leading-snug text-[#132320]">
                      Bagikan Pengalaman Anda
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#132320]/55">
                      Bantu Bisnis Kami Berkembang dengan ulasan di Google
                      Maps.
                    </p>
                  </div>
                </div>
                <span
                  className="flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[10.5px] font-bold text-white shadow-sm transition group-hover:gap-2"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--brand), var(--brand-dark))",
                  }}
                >
                  <GoogleIcon className="h-3 w-3 shrink-0" />
                  Tulis Review di Google Maps
                  <Star className="h-3 w-3 shrink-0" />
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </span>
              </button>

              <button
                onClick={() => setStep("form")}
                className="group flex w-full flex-col gap-2.5 rounded-2xl p-3 text-left transition hover:-translate-y-0.5"
                style={{
                  backgroundColor: "color-mix(in srgb, #132320 5%, white)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm transition group-hover:scale-105"
                    style={{
                      backgroundColor: "color-mix(in srgb, #132320 10%, white)",
                      color: "#132320",
                    }}
                  >
                    <MessageSquareCheck className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold leading-snug text-[#132320]">
                      Hubungi Layanan Pelanggan
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#132320]/55">
                      Dapatkan Bantuan Cepat atau Solusi Masalah.
                    </p>
                  </div>
                </div>
                <span className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#132320] px-3 py-2.5 text-[10.5px] font-bold text-white shadow-sm transition group-hover:gap-2">
                  <MessageSquareCheck className="h-3 w-3 shrink-0" />
                  Hubungi Owner / Customer Service
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </span>
              </button>
            </div>
          )}

          {step === "form" && (
            <div className="space-y-5 border-t border-black/[0.06] pt-5">
              {sentAnonymously ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#F6F8F7] px-5 py-8 text-center">
                  <CheckCircle2 className="h-9 w-9 text-[var(--brand)]" />
                  <p className="font-semibold text-[#132320]">
                    Terima kasih atas masukan Anda
                  </p>
                  <p className="text-sm text-[#132320]/55">
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
                    className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-xs font-medium text-[#132320]/45 transition hover:text-[#132320] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Kembali
                  </button>

                  {!anonymous && (
                    <div className="space-y-1.5">
                      <Label htmlFor="customerName">Nama (Opsional)</Label>
                      <Input
                        id="customerName"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Nama Anda"
                        className="h-11 text-base"
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
                      className="text-base"
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
                        <span className="flex-1 truncate text-xs text-[#132320]/55">
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
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-dashed border-black/[0.14] px-3.5 py-3 text-left transition hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/[0.03]"
                      >
                        <ImagePlus className="h-4 w-4 shrink-0 text-[#132320]/40" />
                        <span className="text-xs text-[#132320]/50">
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

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-black/[0.07] bg-[#F6F8F7] px-3.5 py-3">
                    <input
                      type="checkbox"
                      checked={anonymous}
                      onChange={(e) => {
                        setAnonymous(e.target.checked);
                        if (e.target.checked) setCustomerName("");
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                    />
                    <span className="text-xs leading-relaxed text-[#132320]/70">
                      <span className="mb-0.5 flex items-center gap-1 font-medium text-[#132320]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Kirim sebagai anonim
                      </span>
                      Nama disembunyikan, laporan langsung masuk ke dashboard
                      pemilik toko tanpa lewat WhatsApp.
                    </span>
                  </label>

                  {error && <p className="text-sm text-[#B5585E]">{error}</p>}

                  <Button
                    onClick={handleSubmitComplaint}
                    disabled={loading}
                    className="relative h-12 w-full overflow-hidden rounded-xl bg-[#132320] text-[15px] font-semibold text-white shadow-[0_10px_25px_-10px_rgba(19,35,32,0.5)] hover:bg-[#0B1512]"
                  >
                    {loading && (
                      <span
                        className="absolute inset-y-0 left-0 bg-white/15 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    )}
                    <span className="relative flex items-center gap-2">
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

                  <p className="text-center text-[11px] leading-relaxed text-[#132320]/35">
                    Masukan Anda bersifat rahasia &amp; hanya diteruskan
                    kepada pemilik usaha.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
