"use client";
// app/reset-password/reset-password-form.tsx
//
// Halaman ini dibuka dari link di email reset password. Supabase
// mengirim pengguna ke sini dengan salah satu dari 2 bentuk:
// 1. ?code=xxxx (PKCE, default @supabase/ssr) - perlu ditukar manual
//    lewat exchangeCodeForSession sebelum sesi "recovery" aktif.
// 2. #access_token=...&type=recovery (implicit) - otomatis dibaca
//    sendiri oleh Supabase client browser (detectSessionInUrl),
//    tidak perlu kode tambahan.
// Makanya di sini kita coba DUA-DUANYA supaya tidak tergantung
// konfigurasi email template Supabase yang sedang aktif.

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  KeyRound,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const HEADING = { fontFamily: "var(--font-admin-heading)" };
const BODY = { fontFamily: "var(--font-admin-body)" };

type VerifyState = "checking" | "ready" | "invalid";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [verifyState, setVerifyState] = useState<VerifyState>("checking");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function verify() {
      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (!cancelled) {
          setVerifyState(exchangeError ? "invalid" : "ready");
        }
        return;
      }

      // Bukan format ?code= - kemungkinan implicit flow (#access_token
      // di hash), yang otomatis sudah diproses Supabase client duluan.
      // Cek apakah sesinya memang sudah terbentuk.
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setVerifyState(data.session ? "ready" : "invalid");
      }
    }

    // Jaga-jaga kalau sesi baru terbentuk SETELAH verify() pertama
    // selesai (implicit flow kadang butuh sedikit waktu).
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) {
        setVerifyState("ready");
      }
    });

    verify();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError("Gagal mengubah password. Coba minta link reset baru.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (verifyState === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 text-[#132320]/50">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Memverifikasi link...</p>
      </div>
    );
  }

  if (verifyState === "invalid") {
    return (
      <div
        className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-500"
        style={BODY}
      >
        <Card className="relative overflow-hidden border-black/[0.04] bg-white/95 shadow-[0_1px_2px_rgba(19,35,32,0.04),0_35px_70px_-25px_rgba(19,35,32,0.38)] backdrop-blur-xl">
          <div
            className="absolute inset-x-0 top-0 h-1.5"
            style={{ background: "#B5585E" }}
          />
          <CardHeader className="flex flex-col items-center px-7 pt-10 text-center sm:px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B5585E]/10 text-[#B5585E]">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h1
              className="mt-4 text-2xl font-bold leading-tight text-[#132320]"
              style={HEADING}
            >
              Link Tidak Berlaku
            </h1>
            <p className="mt-1.5 text-sm text-[#132320]/55">
              Link reset password ini sudah kedaluwarsa atau sudah pernah
              dipakai. Minta link baru untuk melanjutkan.
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-9 sm:px-7">
            <Link href="/forgot-password">
              <Button className="h-11 w-full rounded-xl bg-[#132320] text-white hover:bg-[#0B1512]">
                Minta Link Baru
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-500"
      style={BODY}
    >
      <Card className="relative overflow-hidden border-black/[0.04] bg-white/95 shadow-[0_1px_2px_rgba(19,35,32,0.04),0_35px_70px_-25px_rgba(19,35,32,0.38)] backdrop-blur-xl">
        <div
          className="absolute inset-x-0 top-0 h-1.5"
          style={{
            background:
              "linear-gradient(90deg, var(--brand), var(--brand-dark))",
          }}
        />

        <CardHeader className="flex flex-col items-center px-7 pt-10 text-center sm:px-8">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{
              background:
                "linear-gradient(135deg, var(--brand), var(--brand-dark))",
            }}
          >
            <KeyRound className="h-6 w-6" />
          </div>
          <h1
            className="mt-4 text-2xl font-bold leading-tight text-[#132320]"
            style={HEADING}
          >
            Atur Password Baru
          </h1>
          <p className="mt-1.5 text-sm text-[#132320]/55">
            Buat password baru untuk akun kamu.
          </p>
        </CardHeader>

        <CardContent className="px-6 pb-9 sm:px-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="gap-1.5">
                <Lock className="h-3.5 w-3.5 text-[#132320]/40" />
                Password Baru
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  autoFocus
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-11 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={
                    showPassword ? "Sembunyikan password" : "Lihat password"
                  }
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#132320]/40 transition hover:text-[#132320]/70"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="gap-1.5">
                <Lock className="h-3.5 w-3.5 text-[#132320]/40" />
                Konfirmasi Password
              </Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 text-base"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-[#B5585E]/10 px-3.5 py-2.5 text-sm text-[#B5585E]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#132320] text-[15px] font-semibold text-white shadow-[0_10px_25px_-10px_rgba(19,35,32,0.5)] hover:bg-[#0B1512]"
            >
              <span className="flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Menyimpan..." : "Simpan Password Baru"}
              </span>
            </Button>

            <Link
              href="/login"
              className="flex items-center justify-center gap-1 text-sm text-[#132320]/50 hover:text-[#132320]/80"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Kembali ke Login
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
