// app/login/page.tsx

export const runtime = "edge";

import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { darkenHex, lightenHex } from "@/lib/utils";
import { LoginForm } from "./login-form";

// Halaman ini dipakai oleh SEMUA owner (belum tau toko mana), jadi
// tidak ada brand_color spesifik untuk dipakai - sama seperti
// app/activate/[id]/page.tsx, pakai warna default platform.
const DEFAULT_BRAND = "#0E7C86";

export default async function LoginPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const brandDark = darkenHex(DEFAULT_BRAND, 12);
  const brandTint = lightenHex(DEFAULT_BRAND, 90);

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F3F4F1] px-4 py-10"
      style={
        {
          "--brand": DEFAULT_BRAND,
          "--brand-dark": brandDark,
          "--brand-tint": brandTint,
        } as CSSProperties
      }
    >
      {/* Background sama persis polanya dengan halaman aktivasi &
          feedback - dot-grid halus + orb warna brand yang di-blur. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(19,35,32,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: DEFAULT_BRAND, opacity: 0.16 }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: brandDark, opacity: 0.12 }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${brandTint} 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10">
        <LoginForm />
      </div>
    </main>
  );
}
