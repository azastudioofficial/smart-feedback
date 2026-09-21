// app/r/[uid]/page.tsx
// Pintu masuk pertama saat pelanggan scan QR / tap NFC.
// URL: domain.com/r/X7k9P2  (short_code) atau domain.com/r/<uuid>

export const runtime = "edge";

import { redirect, notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ uid: string }>;
};

// Regex sederhana untuk deteksi apakah "uid" itu UUID atau short_code
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ScanRoutePage({ params }: Props) {
  const { uid } = await params;

  // createServiceClient dipakai karena pelanggan belum login sama sekali
  // saat scan QR — kita butuh baca data produk lintas-owner.
  // Query dibatasi hanya kolom yang perlu (tidak select pin_hash dsb).
  const supabase = createServiceClient();

  const isUuid = UUID_REGEX.test(uid);

  const { data: product, error } = await supabase
    .from("products")
    .select("id, is_active, is_suspended")
    .eq(isUuid ? "id" : "short_code", uid)
    .maybeSingle();

  if (error) {
    console.error("Gagal query produk saat scan:", error.message);
    notFound();
  }

  if (!product) {
    notFound();
  }

  // 1. Toko ditangguhkan (menunggak dsb) -> tampilkan pesan, JANGAN redirect
  if (product.is_suspended) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-rose-600">
            Layanan Ditangguhkan
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Mohon maaf, layanan feedback untuk toko ini sedang tidak aktif.
            Silakan hubungi pemilik toko atau penyedia layanan.
          </p>
        </div>
      </main>
    );
  }

  // 2. Belum diaktivasi oleh owner -> ke halaman aktivasi
  if (!product.is_active) {
    redirect(`/activate/${product.id}`);
  }

  // 3. Aktif -> catat scan (fire-and-forget, tidak menunda redirect kalau gagal)
  //    dan lanjut ke halaman feedback pelanggan.
  await supabase.from("scan_logs").insert({
    product_id: product.id,
  });
  // Catatan: ip_hash/user_agent bisa ditambahkan di sini kalau nanti
  // mau anti-spam analytics (lihat saran sebelumnya) — dilewat dulu
  // supaya halaman ini tetap sederhana untuk MVP.

  redirect(`/feedback/${product.id}`);
}
