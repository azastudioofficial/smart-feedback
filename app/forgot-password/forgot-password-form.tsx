"use client";
// app/forgot-password/forgot-password-form.tsx

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound, Mail, Loader2, ChevronLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const HEADING = { fontFamily: "var(--font-admin-heading)" };
const BODY = { fontFamily: "var(--font-admin-body)" };

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        // Halaman ini yang akan dibuka dari link di email - lihat
        // app/reset-password/reset-password-form.tsx untuk proses
        // tukar kode -> sesi -> set password baru.
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    setLoading(false);

    // Sengaja SELALU tampilkan pesan sukses yang sama, ada error atau
    // tidak (kecuali error jaringan) - supaya orang lain tidak bisa
    // "menebak" email mana yang terdaftar di sistem lewat pesan error.
    if (resetError && resetError.status && resetError.status >= 500) {
      setError("Terjadi gangguan, coba lagi sebentar lagi.");
      return;
    }

    setSent(true);
  }

  if (sent) {
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)]">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1
              className="mt-4 text-2xl font-bold leading-tight text-[#132320]"
              style={HEADING}
            >
              Cek Email Kamu
            </h1>
            <p className="mt-1.5 text-sm text-[#132320]/55">
              Kalau email itu terdaftar, kami sudah kirim link untuk atur
              password baru. Buka email &amp; ikuti link-nya (cek folder
              spam kalau belum muncul).
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-9 sm:px-7">
            <Link href="/login">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl"
              >
                <ChevronLeft className="h-4 w-4" />
                Kembali ke Login
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
            Lupa Password?
          </h1>
          <p className="mt-1.5 text-sm text-[#132320]/55">
            Masukkan email akun kamu, kami kirimkan link untuk atur
            password baru.
          </p>
        </CardHeader>

        <CardContent className="px-6 pb-9 sm:px-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[#132320]/40" />
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                className="h-11 text-base"
              />
            </div>

            {error && <p className="text-sm text-[#B5585E]">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#132320] text-[15px] font-semibold text-white shadow-[0_10px_25px_-10px_rgba(19,35,32,0.5)] hover:bg-[#0B1512]"
            >
              <span className="flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Mengirim..." : "Kirim Link Reset"}
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
