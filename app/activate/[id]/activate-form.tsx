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
  Check,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Pencil,
  QrCode,
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

// Wizard 3 langkah: satu topik per layar, biar pelanggan tidak
// dihadapkan tembok form panjang di HP. Data semua langkah disimpan
// di satu state, lalu dikirim sekali di langkah terakhir lewat
// activateProduct() yang sama persis seperti sebelumnya.
const STEPS = ["Toko", "Akun", "Konfirmasi"] as const;

const STEP_TITLES = [
  {
    title: "Data Toko Anda",
    subtitle: "Cukup 2 menit. Mulai dari nama toko dan link review.",
  },
  {
    title: "Buat Akun Login",
    subtitle: "Untuk masuk ke dashboard dan melihat feedback pelanggan.",
  },
  {
    title: "Cek & Kirim",
    subtitle: "Pastikan datanya benar, lalu kirim permohonan aktivasi.",
  },
] as const;

type FieldErrors = Partial<
  Record<"businessName" | "googleReviewUrl" | "ownerWhatsapp" | "email" | "password", string>
>;

function isValidHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center justify-center gap-2" aria-label="Langkah aktivasi">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span
                aria-current={active ? "step" : undefined}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  done || active
                    ? "bg-[var(--brand)] text-white"
                    : "bg-black/[0.06] text-[#132320]/40"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={`text-xs font-medium ${
                  active ? "text-[#132320]" : "text-[#132320]/40"
                }`}
              >
                {label}
              </span>
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={`h-px w-6 sm:w-8 ${
                  done ? "bg-[var(--brand)]" : "bg-black/10"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ID Kartu = kode pendek di URL QR (sama dengan kolom "ID Kartu" di panel
// admin). Ditampilkan di semua langkah supaya pelanggan bisa menyebutkannya
// ke penyedia layanan kalau perlu bantuan, dan admin langsung tahu kartu
// yang mana. Teks bisa di-select penuh dengan satu ketukan.
function CardIdBadge({ code }: { code: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] py-1.5 pl-2.5 pr-3 text-[11px] text-[#132320]/55">
      <QrCode className="h-3.5 w-3.5 text-[#132320]/40" aria-hidden />
      ID Kartu
      <span
        className="select-all font-bold tracking-wide text-[#132320]/80"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      >
        {code}
      </span>
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-[#B5585E]">{message}</p>;
}

export function ActivateForm({
  productId,
  shortCode,
  isPro,
}: {
  productId: string;
  /** ID Kartu (short_code) - hanya untuk ditampilkan. */
  shortCode: string;
  // Basic: pelanggan langsung di-redirect ke Google Review, tidak ada
  // alur keluhan sama sekali - jadi WhatsApp owner (dipakai buat
  // terusin keluhan pelanggan) tidak perlu ditanya di awal.
  isPro: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  // true = kartu "stok aktif": langsung aktif, tanpa menunggu persetujuan.
  const [autoApproved, setAutoApproved] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [values, setValues] = useState({
    businessName: "",
    googleReviewUrl: "",
    ownerWhatsapp: "",
    email: "",
    password: "",
  });
  const redirectingRef = useRef(false);

  function setValue(name: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    // Error field hilang begitu pelanggan mulai memperbaiki isiannya.
    setFieldErrors((e) => ({ ...e, [name]: undefined }));
  }

  // Selama menunggu approval, polling status kartu tiap beberapa
  // detik. Begitu admin/reseller meng-ACC (is_active jadi true),
  // otomatis pindah ke halaman feedback - tanpa scan ulang QR.
  useEffect(() => {
    if (!submitted) return;

    // Kartu stok aktif sudah aktif sejak submit - tidak perlu polling,
    // cukup beri jeda singkat supaya pesan sukses sempat terbaca.
    if (autoApproved) {
      const t = setTimeout(() => {
        if (redirectingRef.current) return;
        redirectingRef.current = true;
        router.replace(`/feedback/${productId}`);
      }, 1800);
      return () => clearTimeout(t);
    }

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
  }, [submitted, autoApproved, productId, router]);

  function validateStep(target: number): boolean {
    const errs: FieldErrors = {};

    if (target === 0) {
      if (!values.businessName.trim()) {
        errs.businessName = "Nama toko wajib diisi.";
      }
      const url = values.googleReviewUrl.trim();
      if (!url) {
        errs.googleReviewUrl = "Link Google Review wajib diisi.";
      } else if (!isValidHttpUrl(url)) {
        errs.googleReviewUrl =
          "Link harus diawali https:// - salin langsung dari Google Maps.";
      }
      if (isPro) {
        const digits = values.ownerWhatsapp.replace(/\D/g, "");
        if (digits.length < 9 || digits.length > 15) {
          errs.ownerWhatsapp = "Masukkan nomor WhatsApp yang valid, mis. 0812xxxxxxxx.";
        }
      }
    }

    if (target === 1) {
      if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
        errs.email = "Masukkan alamat email yang valid.";
      }
      if (values.password.length < 6) {
        errs.password = "Password minimal 6 karakter.";
      }
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() {
    setError(null);
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setFieldErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Tombol Enter di langkah 1-2 = "Lanjut", bukan kirim.
    if (step < STEPS.length - 1) {
      goNext();
      return;
    }

    setError(null);

    if (!agreedToTerms) {
      setError("Anda harus menyetujui Syarat & Ketentuan Layanan.");
      return;
    }

    setLoading(true);

    const result = await activateProduct(productId, {
      businessName: values.businessName.trim(),
      googleReviewUrl: values.googleReviewUrl.trim(),
      // Basic tidak punya field ini di form (lihat isPro di bawah) -
      // dikirim kosong, bukan di-skip, biar bentuk datanya konsisten.
      ownerWhatsapp: isPro ? values.ownerWhatsapp.trim() : "",
      email: values.email.trim(),
      password: values.password,
      agreedToTerms,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Terjadi kesalahan. Coba lagi.");
      // Error paling umum = email sudah dipakai. Balikkan pelanggan ke
      // langkah Akun supaya langsung bisa ganti, bukan bingung di
      // layar konfirmasi.
      if (result.error?.toLowerCase().includes("email")) {
        setStep(1);
      }
      return;
    }

    setAutoApproved(result.autoApproved === true);
    setSubmitted(true);
  }

  if (submitted && autoApproved) {
    return (
      <div
        className="w-full max-w-md animate-in fade-in slide-in-from-bottom-3 duration-500"
        style={BODY}
      >
        <Card className="shadow-[0_25px_60px_-20px_rgba(19,35,32,0.28)]">
          <CardContent className="flex flex-col items-center px-7 py-10 text-center sm:px-8">
            <CheckCircle2 className="h-12 w-12 text-[var(--brand)]" />
            <h1 className="mt-4 text-xl font-bold text-[#132320]">
              Aktivasi Berhasil
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#132320]/55">
              QR/NFC ini sudah{" "}
              <strong className="text-[#132320]">aktif</strong> dan langsung
              bisa dipakai pelanggan. Anda bisa login ke dashboard memakai
              email &amp; password yang baru saja didaftarkan.
            </p>
            <div className="mt-4">
              <CardIdBadge code={shortCode} />
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-[#132320]/40">
              <Loader2 className="h-3 w-3 animate-spin" />
              Membuka halaman toko Anda...
            </p>
          </CardContent>
        </Card>
      </div>
    );
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
            <div className="mt-4">
              <CardIdBadge code={shortCode} />
            </div>
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

  const stepInfo = STEP_TITLES[step];

  return (
    <div
      className="w-full max-w-md animate-in fade-in slide-in-from-bottom-3 duration-500"
      style={BODY}
    >
      <Card className="overflow-hidden shadow-[0_25px_60px_-20px_rgba(19,35,32,0.28)]">
        <CardHeader className="flex flex-col items-center px-6 pt-7 text-center sm:px-8">
          <CardIdBadge code={shortCode} />
          <div className="mt-4">
            <Stepper current={step} />
          </div>
          <p
            className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]"
            style={DISPLAY}
          >
            Langkah {step + 1} dari {STEPS.length}
          </p>
          <h1
            className="mt-1 text-2xl font-bold leading-tight text-[#132320]"
            style={DISPLAY}
          >
            {stepInfo.title}
          </h1>
          <p className="mt-1.5 text-sm text-[#132320]/55">
            {stepInfo.subtitle}
          </p>
        </CardHeader>

        <CardContent className="px-6 pb-7 sm:px-7">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* key={step} = animasi masuk ulang tiap pindah langkah */}
            <div
              key={step}
              className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300"
            >
              {step === 0 && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="businessName" className="gap-1.5">
                      <Store className="h-3.5 w-3.5 text-[#132320]/40" />
                      Nama Toko / Bisnis
                    </Label>
                    <Input
                      id="businessName"
                      value={values.businessName}
                      onChange={(e) => setValue("businessName", e.target.value)}
                      autoComplete="organization"
                      placeholder="Contoh: Kopi Senja"
                      className="h-12 text-base"
                    />
                    <FieldError message={fieldErrors.businessName} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="googleReviewUrl" className="gap-1.5">
                      <Star className="h-3.5 w-3.5 text-[#132320]/40" />
                      Link Google Review
                    </Label>
                    <Input
                      id="googleReviewUrl"
                      type="url"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={values.googleReviewUrl}
                      onChange={(e) =>
                        setValue("googleReviewUrl", e.target.value)
                      }
                      placeholder="https://g.page/r/..."
                      className="h-12 text-base"
                    />
                    <FieldError message={fieldErrors.googleReviewUrl} />
                    <p className="text-xs leading-relaxed text-[#132320]/45">
                      Belum punya? Buka Google Maps, cari toko Anda, pilih{" "}
                      <strong className="font-medium text-[#132320]/65">
                        Bagikan
                      </strong>{" "}
                      lalu salin link-nya dan tempel di sini.
                    </p>
                  </div>

                  {isPro && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ownerWhatsapp" className="gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-[#132320]/40" />
                        Nomor WhatsApp Owner
                      </Label>
                      <Input
                        id="ownerWhatsapp"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={values.ownerWhatsapp}
                        onChange={(e) =>
                          setValue("ownerWhatsapp", e.target.value)
                        }
                        placeholder="0812xxxxxxxx"
                        className="h-12 text-base"
                      />
                      <FieldError message={fieldErrors.ownerWhatsapp} />
                      <p className="text-xs text-[#132320]/45">
                        Keluhan pelanggan akan diteruskan ke nomor ini.
                      </p>
                    </div>
                  )}
                </>
              )}

              {step === 1 && (
                <>
                  <p className="rounded-xl bg-[#F6F8F7] px-3.5 py-2.5 text-xs leading-relaxed text-[#132320]/55">
                    Satu email hanya bisa dipakai untuk satu toko - gunakan
                    email yang belum pernah dipakai aktivasi sebelumnya.
                  </p>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-[#132320]/40" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={values.email}
                      onChange={(e) => setValue("email", e.target.value)}
                      placeholder="nama@email.com"
                      className="h-12 text-base"
                    />
                    <FieldError message={fieldErrors.email} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-[#132320]/40" />
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={values.password}
                        onChange={(e) => setValue("password", e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="h-12 pr-12 text-base"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword
                            ? "Sembunyikan password"
                            : "Tampilkan password"
                        }
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#132320]/45 hover:text-[#132320]/75"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FieldError message={fieldErrors.password} />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <dl className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.07]">
                    {[
                      { label: "Nama toko", value: values.businessName, go: 0 },
                      {
                        label: "Link Google Review",
                        value: values.googleReviewUrl,
                        go: 0,
                      },
                      ...(isPro
                        ? [
                            {
                              label: "WhatsApp owner",
                              value: values.ownerWhatsapp,
                              go: 0,
                            },
                          ]
                        : []),
                      { label: "Email login", value: values.email, go: 1 },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-start justify-between gap-3 px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#132320]/40">
                            {row.label}
                          </dt>
                          <dd className="mt-0.5 break-words text-sm font-medium text-[#132320]">
                            {row.value}
                          </dd>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setStep(row.go);
                          }}
                          aria-label={`Ubah ${row.label}`}
                          className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--brand)]"
                        >
                          <Pencil className="h-3 w-3" />
                          Ubah
                        </button>
                      </div>
                    ))}
                  </dl>

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
                      , termasuk kebijakan penghapusan otomatis data aduan
                      setelah 30 hari.
                    </span>
                  </label>
                </>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-[#B5585E]">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={loading}
                  className="h-12 rounded-xl px-4"
                  aria-label="Kembali"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}

              {step < STEPS.length - 1 ? (
                <Button
                  type="submit"
                  className="h-12 flex-1 rounded-xl bg-[#132320] text-[15px] font-semibold text-white hover:bg-[#0B1512]"
                >
                  <span className="flex items-center gap-2">
                    Lanjut
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={loading || !agreedToTerms}
                  className="h-12 flex-1 rounded-xl bg-[#132320] text-[15px] font-semibold text-white hover:bg-[#0B1512]"
                >
                  <span className="flex items-center gap-2">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading ? "Mengirim..." : "Kirim Permohonan Aktivasi"}
                  </span>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
