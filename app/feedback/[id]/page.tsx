// app/feedback/[id]/page.tsx

import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Ban, Settings } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { darkenHex, lightenHex } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { FeedbackCard } from "./feedback-card";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function FeedbackPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("id, business_name, google_review_url, logo_url, cover_image_url, cover_position, brand_color, social_links, is_active, is_suspended, plan")
    .eq("id", id)
    .maybeSingle();

  if (error || !product) {
    notFound();
  }

  if (product.is_suspended) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-6"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <Card className="w-full max-w-sm shadow-[0_25px_60px_-20px_rgba(19,35,32,0.25)]">
          <CardContent className="flex flex-col items-center px-7 py-9 text-center sm:px-8">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FCEEF0] text-[#B5585E]">
              <Ban className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-xl font-bold text-[#132320]">
              Layanan Ditangguhkan
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#132320]/55">
              Mohon maaf, layanan feedback untuk toko ini sedang tidak aktif.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Jaga-jaga kalau ada yang buka link /feedback/[id] langsung
  // sebelum toko diaktivasi (harusnya sudah kefilter di /r/[uid]).
  if (!product.is_active) {
    redirect(`/activate/${product.id}`);
  }

  // Paket Basic tidak punya halaman feedback - jaga-jaga kalau ada yang
  // membuka /feedback/[id] langsung, arahkan ke Google Review.
  if (product.plan !== "pro") {
    if (product.google_review_url) {
      redirect(product.google_review_url);
    }
    notFound();
  }

  const brandColor = product.brand_color || "#0E7C86";
  const brandDark = darkenHex(brandColor, 12);
  // Tint sangat muda dari warna brand yang sama - dipakai untuk glow
  // & orb dekoratif, tanpa owner perlu pilih warna kedua.
  const brandTint = lightenHex(brandColor, 90);

  return (
    <main
      className="relative flex min-h-[100dvh] items-start justify-center overflow-hidden bg-[#F3F4F1] sm:items-center sm:px-4 sm:py-10"
      style={
        {
          "--brand": brandColor,
          "--brand-dark": brandDark,
          "--brand-tint": brandTint,
        } as CSSProperties
      }
    >
      {/* Tekstur dot-grid halus - ciri khas halaman onboarding app SaaS
          premium (Linear/Vercel), bikin background nggak keliatan
          kosong polos tapi tetap tidak mengganggu. */}
      <div
        className="pointer-events-none absolute inset-0 hidden opacity-[0.5] sm:block"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(19,35,32,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Orb warna brand yang di-blur besar di pojok - ngasih "warna"
          ke background tanpa bikin ramai/norak. */}
      <div
        className="pointer-events-none absolute -left-28 -top-28 hidden h-80 w-80 rounded-full blur-3xl sm:block"
        style={{ backgroundColor: brandColor, opacity: 0.16 }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-20 hidden h-96 w-96 rounded-full blur-3xl sm:block"
        style={{ backgroundColor: brandDark, opacity: 0.12 }}
      />

      {/* Glow lembut tepat di belakang kartu, biar kartunya "nyala" /
          jadi pusat perhatian - bukan cuma numpuk di background polos. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl sm:block"
        style={{
          background: `radial-gradient(circle, ${brandTint} 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 flex min-h-[100dvh] w-full justify-center sm:min-h-0 sm:w-auto">
        <FeedbackCard product={product} />
      </div>

      {/* Posisi absolute (bukan fixed) + ruang kosong di bawah kartu
          (pb-24): dulu tombol ini melayang di atas layar dan menutupi
          tombol panah kartu saat halaman digulir di HP. Sekarang ia
          duduk di bawah kartu, di luar area konten. */}
      {/* Shortcut buat OWNER - kartu QR yang sama di-scan pelanggan
          maupun owner sendiri, jadi owner perlu jalan pintas ke
          dashboard tanpa harus inget/ketik URL terpisah. Sengaja
          dibuat kecil & transparan (bukan tombol mencolok) supaya
          nggak mengganggu/membingungkan pelanggan yang lihat halaman
          ini - link ini TETAP mengarah ke halaman login biasa, jadi
          tidak membuka celah akses apapun, cuma jalan pintas navigasi. */}
      <Link
        href="/login"
        className="absolute right-3 top-3 z-20 flex h-11 w-11 sm:bottom-5 sm:right-5 sm:top-auto items-center justify-center rounded-full bg-white/70 text-[#132320]/30 shadow-sm backdrop-blur transition hover:text-[#132320]/70 active:scale-95"
        title="Kelola Toko (khusus owner)"
      >
        <Settings className="h-5 w-5" />
      </Link>
    </main>
  );
}
