"use client";
// app/login/login-form.tsx

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { login } from "./actions";

// Halaman login ini gerbang menuju DASHBOARD, jadi dipasangkan dengan
// font admin (Manrope untuk judul, Inter untuk body) - sama seperti
// dashboard, BUKAN --font-display yang khusus dipakai di halaman
// customer-facing (feedback/aktivasi).
const HEADING = { fontFamily: "var(--font-admin-heading)" };
const BODY = { fontFamily: "var(--font-admin-body)" };

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = await login(
      String(form.get("email") ?? ""),
      String(form.get("password") ?? "")
    );

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Gagal login.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div
      className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-500"
      style={BODY}
    >
      <Card className="relative overflow-hidden border-black/[0.04] bg-white/95 shadow-[0_1px_2px_rgba(19,35,32,0.04),0_35px_70px_-25px_rgba(19,35,32,0.38)] backdrop-blur-xl">
        {/* Aksen gradient tipis di tepi atas - sama seperti kartu di
            halaman feedback & aktivasi. */}
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
            <LogIn className="h-6 w-6" />
          </div>
          <p
            className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]"
            style={HEADING}
          >
            Dashboard Owner
          </p>
          <h1
            className="mt-1 text-2xl font-bold leading-tight text-[#132320]"
            style={HEADING}
          >
            Selamat Datang Kembali
          </h1>
          <p className="mt-1.5 text-sm text-[#132320]/55">
            Masuk untuk kelola toko & lihat masukan pelanggan.
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
                {loading ? "Memproses..." : "Login"}
              </span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
