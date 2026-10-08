// app/feedback/[id]/page.tsx

import { notFound, redirect } from "next/navigation";
import { cache, type CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Ban } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { darkenHex, lightenHex } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { FeedbackCard } from "./feedback-card";

// Halaman pelanggan HARUS dirender ulang di setiap kunjungan. Tanpa ini Next.js
// boleh menganggapnya halaman statis (tidak memakai cookies/headers) dan
// menyimpannya, sehingga perubahan ikon/judul/keterangan kartu dari dasbor
// owner tidak langsung terlihat.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

// Warna teks yang terbaca di atas warna brand: putih untuk brand gelap/
// sedang, gelap untuk brand yang terang (mis. kuning).
function onBrandColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return L > 0.3 ? "#132320" : "#ffffff";
}

// Dibungkus cache(): generateMetadata, generateViewport, dan halaman di
// bawah ini memanggil fungsi yang sama dalam satu request, tapi Supabase
// hanya ditanya SEKALI.
const getProduct = cache(async (id: string) => {
  const supabase = createServiceClient();
  return supabase
    .from("products")
    .select("id, business_name, google_review_url, logo_url, cover_image_url, cover_position, brand_color, social_links, connect_title, connect_description, is_active, is_suspended, plan")
    .eq("id", id)
    .maybeSingle();
});

// Kustomisasi dua kartu pilihan (ikon/judul/keterangan dari owner Pro).
// Dibaca TERPISAH dan gagal-aman: kalau kolomnya belum ada di database
// (sql/16 belum dijalankan) atau query gagal, halaman pelanggan tetap
// tampil normal dengan teks & ikon bawaan.
const getCardCustomization = cache(async (id: string) => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "review_card_title, review_card_description, review_card_icon_url, complaint_card_title, complaint_card_description, complaint_card_icon_url"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Gagal ambil kustomisasi kartu:", error.message);
    return null;
  }
  return data;
});

// Judul tab = nama toko (bukan nama aplikasi), dan halaman ini tidak perlu
// muncul di hasil pencarian Google - ini halaman pelanggan sekali pakai.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { data: product } = await getProduct(id);
  return {
    title: product?.business_name ? `${product.business_name} · Feedback` : "Feedback",
    robots: { index: false, follow: false },
  };
}

// Bilah alamat browser di HP ikut warna brand toko - terasa seperti
// aplikasi sendiri, bukan halaman web biasa.
export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { id } = await params;
  const { data: product } = await getProduct(id);
  const c = product?.brand_color;
  return {
    themeColor: c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined,
  };
}

export default async function FeedbackPage({ params }: Props) {
  const { id } = await params;
  const { data: product, error } = await getProduct(id);
  const cardCustom = await getCardCustomization(id);

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
            <p className="mt-2 text-sm leading-relaxed text-[#132320]/68">
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
          "--on-brand": onBrandColor(brandColor),
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

      <div className="relative z-10 flex min-h-[100dvh] w-full justify-center sm:min-h-0 sm:w-auto">
        <FeedbackCard product={{ ...product, ...(cardCustom ?? {}) }} />
      </div>
    </main>
  );
}
