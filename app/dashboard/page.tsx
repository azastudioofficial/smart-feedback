// app/dashboard/page.tsx

import { redirect } from "next/navigation";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { StoreProvider } from "./store-context";
import { OwnerDashboardShell } from "./owner-dashboard-shell";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Gerbang otomatis sesuai role - supaya siapapun yang login lewat
  // /login otomatis diarahkan ke dasbor yang benar.
  const role = user.app_metadata?.role;
  if (role === "super_admin") {
    redirect("/admin/master");
  }
  if (role === "reseller") {
    redirect("/reseller");
  }

  // Pakai client biasa (ikut RLS) - otomatis cuma dapat produk milik user ini
  const { data: products } = await supabase
    .from("products")
    .select(
      "id, short_code, business_name, google_review_url, owner_whatsapp, logo_url, cover_image_url, cover_position, brand_color, social_links, plan"
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (!products || products.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-4">
        <div className="max-w-sm text-center">
          <p className="text-[#132320]">
            Belum ada toko yang terhubung ke akun ini.
          </p>
          <form action={logout} className="mt-4">
            <Button type="submit" variant="outline">
              Logout
            </Button>
          </form>
        </div>
      </main>
    );
  }

  // Paket Basic: dasbor lengkap terkunci. Owner tetap bisa login dan
  // melihat statusnya, tapi fitur keluhan/analytics/QR/pengaturan hanya
  // untuk Pro. Upgrade dilakukan admin lewat /admin/master.
  if (products[0].plan !== "pro") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] bg-white p-7 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E4F1F1] text-[#0E7C86]">
            <Lock className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-[#132320]">
            Dasbor khusus paket Pro
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#132320]/60">
            {products[0].business_name ?? "Toko Anda"} saat ini memakai paket
            Basic: pelanggan yang scan langsung diarahkan ke Google Review.
            Upgrade ke Pro untuk membuka rekap keluhan, analytics, cetak QR,
            dan pengaturan toko. Hubungi penyedia layanan untuk upgrade.
          </p>
          <form action={logout} className="mt-5">
            <Button type="submit" variant="outline">
              Logout
            </Button>
          </form>
        </div>
      </main>
    );
  }

  // MVP: tampilkan toko pertama. Kalau owner punya beberapa akrilik,
  // bisa dikembangkan jadi selector di iterasi berikutnya.
  const activeProduct = products[0];

  // Data keluhan & statistik pakai service client - lebih ringkas
  // untuk query gabungan, RLS tetap sudah divalidasi lewat pengecekan
  // owner_id di atas.
  const service = createServiceClient();

  const [{ data: feedbacks }, { count: totalScans }, { count: totalPositive }] =
    await Promise.all([
      service
        .from("feedbacks")
        .select("id, customer_name, complaint_text, photo_path, photo_url, is_anonymous, status, created_at")
        .eq("product_id", activeProduct.id)
        .order("created_at", { ascending: false }),
      service
        .from("scan_logs")
        .select("id", { count: "exact", head: true })
        .eq("product_id", activeProduct.id),
      service
        .from("positive_clicks")
        .select("id", { count: "exact", head: true })
        .eq("product_id", activeProduct.id),
    ]);

  // Nama toko / logo / warna brand "dititipkan" ke StoreProvider
  // sebagai nilai AWAL saja - setelah ini, begitu owner ganti apapun
  // di tab Pengaturan, sidebar (OwnerDashboardShell) & tab Cetak QR
  // baca dari context (nilai TERBARU), bukan query ulang ke sini.
  return (
    <StoreProvider
      initialBusinessName={activeProduct.business_name}
      initialLogoUrl={activeProduct.logo_url}
      initialBrandColor={activeProduct.brand_color || "#0E7C86"}
    >
      <OwnerDashboardShell
        product={activeProduct}
        feedbacks={feedbacks ?? []}
        totalScans={totalScans ?? 0}
        totalPositive={totalPositive ?? 0}
        userEmail={user.email ?? ""}
        logoutAction={logout}
      />
    </StoreProvider>
  );
}
