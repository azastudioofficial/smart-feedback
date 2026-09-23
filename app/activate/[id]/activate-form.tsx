"use client";
// app/activate/[id]/activate-form.tsx

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Store,
  Star,
  Phone,
  Mail,
  Lock,
  ShieldCheck,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { activateProduct, checkActivationStatus } from "./actions";

// Interval polling status approval - 5 detik cukup cepat terasa
// "otomatis" buat yang lagi nungguin, tapi tidak bikin server kebanjiran
// request kalau ada banyak orang nungguin bersamaan.
const POLL_INTERVAL_MS = 5000;

// Font pairing sama persis dengan feedback-card.tsx (lihat komentar
// di sana): Space Grotesk ("--font-display") CUMA untuk eyebrow +
// judul utama - 2 momen identitas. Semua teks lain (subtitle, label
// section, form, syarat & ketentuan, status sukses) pakai Inter
// ("--font-admin-body") yang lebih netral untuk teks fungsional.
const BODY = { fontFamily: "var(--font-admin-body)" };
const DISPLAY = { fontFamily: "var(--font-display)" };

export function ActivateForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const redirectingRef = useRef(false);

  // Selama menunggu approval, polling status kartu tiap beberapa
  // detik. Begitu admin/reseller meng-ACC (is_active jadi true),
  // otomatis pindah ke halaman feedback - tanpa scan ulang QR.
  useEffect(() => {
    if (!submitted) return;

    const interval = setInterval(async () => {
      if (redirectingRef.current) return;

      const status = await checkActivationStatus(productId);
      if (status.isActive && !redirectingRef.current) {
        redirectingRef.current = true;
        clearInterval(interval);
        router.replace(`/feedback/${productId}`);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [submitted, productId, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!agreedToTerms) {
      setError("Anda harus menyetujui Syarat & Ketentuan Layanan.");
      return;
    }

    setLoading(true);

    const form = new FormData(e.currentTarget);

    const result = await activateProduct(productId, {
      businessName: String(form.get("businessName") ?? ""),
      googleReviewUrl: String(form.get("googleReviewUrl") ?? ""),
      ownerWhatsapp: String(form.get("ownerWhatsapp") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      agreedToTerms,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Terjadi kesalahan. Coba lagi.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        className="w-full max-w-md animate-in fade-in slide-in-from-bottom-3 duration-500"
        style={BODY}
      >
        <Card className="shadow-[0_25px_60px_-20px_rgba(19,35,32,0.28)]">
          <CardContent className="flex flex-col items-center px-7 py-10 text-center sm:px-8">
            <CheckCircle2 className="h-12 w-12 text-[var(--brand)]" />
            <h1 className="mt-4 text-xl font-bold text-[#132320]">
              Permohonan Terkirim
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#132320]/55">
              Data toko Anda sudah kami terima dan sedang{" "}
              <strong className="text-[#132320]">menunggu persetujuan</strong>{" "}
              dari penyedia layanan. Setelah disetujui, QR/NFC ini otomatis
              aktif dan bisa langsung dipakai pelanggan — Anda akan bisa
              login ke dashboard memakai email &amp; password yang baru saja
              didaftarkan.
            </p>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-[#132320]/40">
              <Loader2 className="h-3 w-3 animate-spin" />
              Tetap di halaman ini - begitu disetujui, halaman feedback
              akan terbuka otomatis.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-md animate-in fade-in slide-in-from-bottom-3 duration-500"
      style={BODY}
    >
      <Card className="overflow-hidden shadow-[0_25px_60px_-20px_rgba(19,35,32,0.28)]">
        <CardHeader className="flex flex-col items-center px-7 pt-8 text-center sm:px-8">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{
              background:
                "linear-gradient(135deg, var(--brand), var(--brand-dark))",
            }}
          >
            <Store className="h-6 w-6" />
          </div>
          <p
            className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]"
            style={DISPLAY}
          >
            Aktivasi Toko Baru
          </p>
          <h1
            className="mt-1 text-2xl font-bold leading-tight text-[#132320]"
            style={DISPLAY}
          >
            Siapkan Toko Anda
          </h1>
          <p className="mt-1.5 text-sm text-[#132320]/55">
            Lengkapi data di bawah untuk mengaktifkan kartu QR/NFC ini.
          </p>
        </CardHeader>

        <CardContent className="px-6 pb-8 sm:px-7">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#132320]/40">
                Informasi Toko
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="businessName" className="gap-1.5">
                  <Store className="h-3.5 w-3.5 text-[#132320]/40" />
                  Nama Toko / Bisnis
                </Label>
                <Input
                  id="businessName"
                  name="businessName"
                  required
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="googleReviewUrl" className="gap-1.5">
                  <Star className="h-3.5 w-3.5 text-[#132320]/40" />
                  Link Google Review
                </Label>
                <Input
                  id="googleReviewUrl"
                  name="googleReviewUrl"
                  type="url"
                  placeholder="https://g.page/r/..."
                  required
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ownerWhatsapp" className="gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-[#132320]/40" />
                  Nomor WhatsApp Owner
                </Label>
                <Input
                  id="ownerWhatsapp"
                  name="ownerWhatsapp"
                  placeholder="0812xxxxxxxx"
                  required
                  className="h-11 text-base"
                />
              </div>
            </div>

            <div className="space-y-4 border-t border-black/[0.06] pt-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#132320]/40">
                  Akun Login Dashboard
                </p>
                <p className="mt-1 text-xs text-[#132320]/45">
                  Satu email hanya bisa dipakai untuk satu toko - gunakan
                  email yang belum pernah dipakai aktivasi sebelumnya.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-[#132320]/40" />
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#132320]/40" />
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  minLength={6}
                  required
                  className="h-11 text-base"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-black/[0.07] bg-[#F6F8F7] px-3.5 py-3">
              <input
                id="agreedToTerms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span className="text-xs leading-relaxed text-[#132320]/70">
                <span className="mb-0.5 flex items-center gap-1 font-medium text-[#132320]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Syarat &amp; Ketentuan
                </span>
                Saya sudah membaca dan menyetujui{" "}
                <Link
                  href="/syarat-ketentuan"
                  target="_blank"
                  className="font-medium text-[var(--brand)] underline underline-offset-2"
                >
                  Syarat &amp; Ketentuan Layanan dan Kebijakan Privasi
                </Link>
                , termasuk kebijakan penghapusan otomatis data aduan setelah
                30 hari.
              </span>
            </label>

            {error && <p className="text-sm text-[#B5585E]">{error}</p>}

            <Button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="h-12 w-full rounded-xl bg-[#132320] text-[15px] font-semibold text-white hover:bg-[#0B1512]"
            >
              <span className="flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Mengirim..." : "Kirim Permohonan Aktivasi"}
              </span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
