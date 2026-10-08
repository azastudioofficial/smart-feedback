// app/dashboard/page.tsx

import { redirect } from "next/navigation";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { StoreProvider } from "./store-context";
import { OwnerDashboardShell } from "./owner-dashboard-shell";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";
import type { ScanBucket, ClickBucket } from "@/lib/analytics";

// Agregasi analytics dikerjakan DI DATABASE lewat fungsi SQL
// owner_analytics() (lihat sql/8-owner-analytics.sql): hasilnya JSON kecil
// berukuran tetap, berapa pun jumlah scan-nya - bukan ribuan baris yang
// ditarik ke server lalu dihitung ulang. Fungsi itu hanya bisa dipanggil
// lewat service client (server), dan productId di sini sudah dipastikan
// milik owner yang login (lihat query products di atas).
const ANALYTICS_DAYS = 90; // sama dengan retensi di app/api/cron/cleanup

function toNumberRows(value: unknown, width: number): number[][] {
  if (!Array.isArray(value)) return [];
  const out: number[][] = [];
  for (const row of value) {
    if (
      Array.isArray(row) &&
      row.length === width &&
      row.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      out.push(row as number[]);
    }
  }
  return out;
}

async function fetchAnalytics(
  service: ReturnType<typeof createServiceClient>,
  productId: string
): Promise<{
  scanBuckets: ScanBucket[];
  clickBuckets: ClickBucket[];
  failed: boolean;
}> {
  const { data, error } = await service.rpc("owner_analytics", {
    p_product_id: productId,
    p_days: ANALYTICS_DAYS,
  });

  if (error || !data) {
    console.error("Gagal memuat owner_analytics:", error?.message);
    return { scanBuckets: [], clickBuckets: [], failed: true };
  }

  const raw = data as { scans?: unknown; clicks?: unknown };
  return {
    scanBuckets: toNumberRows(raw.scans, 3) as ScanBucket[],
    clickBuckets: toNumberRows(raw.clicks, 2) as ClickBucket[],
    failed: false,
  };
}

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
      "id, short_code, business_name, google_review_url, owner_whatsapp, logo_url, cover_image_url, cover_position, brand_color, social_links, connect_title, connect_description, review_card_title, review_card_description, review_card_icon_url, complaint_card_title, complaint_card_description, complaint_card_icon_url, plan"
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

  // MVP: tampilkan toko pertama. Kalau owner punya beberapa akrilik,
  // bisa dikembangkan jadi selector di iterasi berikutnya.
  const activeProduct = products[0];
  const isPro = activeProduct.plan === "pro";

  // Paket Basic: TIDAK dikunci total lagi. Owner Basic tetap bisa
  // masuk dan mengubah Pengaturan Toko (nama, link Google Review,
  // WhatsApp, dst) - yang dikunci cuma tab Analytics/Rekap
  // Keluhan/Cetak QR, karena itu semua fitur khusus alur Pro (lihat
  // owner-dashboard-shell.tsx). Data keluhan & statistik cuma
  // diambil untuk Pro, biar owner Basic tidak menunggu query yang
  // hasilnya toh tidak dipakai.
  const service = createServiceClient();

  const [{ data: feedbacks }, analytics] = isPro
    ? await Promise.all([
        service
          .from("feedbacks")
          .select("id, customer_name, complaint_text, photo_path, photo_url, is_anonymous, status, created_at")
          .eq("product_id", activeProduct.id)
          .order("created_at", { ascending: false }),
        fetchAnalytics(service, activeProduct.id),
      ])
    : [
        { data: [] },
        {
          scanBuckets: [] as ScanBucket[],
          clickBuckets: [] as ClickBucket[],
          failed: false,
        },
      ];

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
        isPro={isPro}
        feedbacks={feedbacks ?? []}
        scanBuckets={analytics.scanBuckets}
        clickBuckets={analytics.clickBuckets}
        analyticsFailed={analytics.failed}
        userEmail={user.email ?? ""}
        logoutAction={logout}
      />
    </StoreProvider>
  );
}
