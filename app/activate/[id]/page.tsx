// app/activate/[id]/page.tsx

import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { Ban, CheckCircle2, Clock3 } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { darkenHex, lightenHex } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ActivateForm } from "./activate-form";

type Props = {
  params: Promise<{ id: string }>;
};

// Belum ada brand_color di tahap ini (owner belum sempat atur apa-apa),
// jadi dipakai warna default platform (sama persis dengan fallback di
// dashboard/page.tsx: brand_color || "#0E7C86"). Begitu owner aktivasi
// & atur warna sendiri di Pengaturan, halaman feedback baru pakai
// warna pilihan mereka - lihat app/feedback/[id]/page.tsx.
const DEFAULT_BRAND = "#0E7C86";

function StatusScreen({
  icon: Icon,
  tone,
  title,
  message,
}: {
  icon: typeof Ban;
  tone: "rose" | "brand" | "amber";
  title: string;
  message: string;
}) {
  const toneClasses = {
    rose: "bg-[#FCEEF0] text-[#B5585E]",
    brand: "bg-[#E4F1F1] text-[#0E7C86]",
    amber: "bg-[#FDF3E4] text-[#B45309]",
  }[tone];

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EAF4F4] via-white to-[#F3F4F2] px-4"
      style={{ fontFamily: "var(--font-display)" }}
    >
      <Card className="w-full max-w-sm shadow-[0_25px_60px_-20px_rgba(19,35,32,0.28)]">
        <CardContent className="flex flex-col items-center px-7 py-9 text-center sm:px-8">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${toneClasses}`}
          >
            <Icon className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-[#132320]">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#132320]/55">
            {message}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function ActivatePage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("id, is_active, is_suspended, pending_review")
    .eq("id", id)
    .maybeSingle();

  if (error || !product) {
    notFound();
  }

  if (product.is_suspended) {
    return (
      <StatusScreen
        icon={Ban}
        tone="rose"
        title="Layanan Ditangguhkan"
        message="QR/NFC ini sedang tidak aktif. Silakan hubungi penyedia layanan."
      />
    );
  }

  if (product.is_active) {
    return (
      <StatusScreen
        icon={CheckCircle2}
        tone="brand"
        title="Sudah Diaktivasi"
        message="QR/NFC ini sudah aktif sebelumnya. Jika ini bukan toko Anda, hubungi penyedia layanan."
      />
    );
  }

  if (product.pending_review) {
    return (
      <StatusScreen
        icon={Clock3}
        tone="amber"
        title="Menunggu Persetujuan"
        message="Permohonan aktivasi untuk QR/NFC ini sudah terkirim dan sedang ditinjau. Silakan cek kembali beberapa saat lagi."
      />
    );
  }

  const brandDark = darkenHex(DEFAULT_BRAND, 12);
  const brandTint = lightenHex(DEFAULT_BRAND, 92);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--brand-tint)] via-white to-[#F3F4F2] px-4 py-10"
      style={
        {
          "--brand": DEFAULT_BRAND,
          "--brand-dark": brandDark,
          "--brand-tint": brandTint,
        } as CSSProperties
      }
    >
      <ActivateForm productId={product.id} />
    </main>
  );
}
