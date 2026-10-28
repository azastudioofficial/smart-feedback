// app/reseller/page.tsx

import { redirect } from "next/navigation";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { InventoryTable } from "../admin/master/inventory-table";
import { PendingRequests } from "@/components/pending-requests";
import { ResellerStats } from "./reseller-stats";
import { logout } from "../dashboard/actions";
import { DashboardShell, type NavSection } from "@/components/dashboard-shell";

export default async function ResellerPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isReseller = user.app_metadata?.role === "reseller";
  if (!isReseller) {
    redirect("/dashboard");
  }

  const { data: resellerProfile } = await supabase
    .from("resellers")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  // RLS otomatis membatasi: cuma kartu dengan reseller_id = akun ini
  const { data: myProducts } = await supabase
    .from("products")
    .select(
      "id, short_code, card_seq, business_name, google_review_url, owner_whatsapp, is_active, is_suspended, pending_review, stock_activated, plan, created_at, last_scanned_at"
    )
    .order("card_seq", { ascending: true });

  const { data: pendingRaw } = await supabase
    .from("products")
    .select(
      "id, short_code, card_seq, business_name, google_review_url, owner_whatsapp, created_at"
    )
    .eq("pending_review", true)
    .order("created_at", { ascending: true });

  const products = myProducts ?? [];
  const displayedProducts = products.slice(0, 25);

  // Hitung scan di DATABASE (fungsi reseller_scan_stats, lihat
  // sql/17-reseller-scan-stats.sql). Dulu semua baris scan_logs ditarik
  // lalu dihitung di JavaScript: terpotong di ~1000 baris, dan akun
  // reseller memang tidak punya policy SELECT di scan_logs.
  // Pakai service client karena fungsi hanya di-grant ke service_role;
  // p_reseller_id diisi dari user.id yang role-nya sudah diverifikasi di atas.
  let scanCounts: Record<string, number> = {};
  let totalScans = 0;

  if (products.length > 0) {
    const { data: scanStats, error: scanError } = await createServiceClient().rpc(
      "reseller_scan_stats",
      {
        p_reseller_id: user.id,
        p_product_ids: displayedProducts.map((p) => p.id),
      }
    );

    if (scanError) {
      console.error("reseller_scan_stats gagal:", scanError.message);
    } else if (scanStats) {
      const parsed = scanStats as {
        total?: number;
        per_product?: Record<string, number>;
      };
      totalScans = parsed.total ?? 0;
      scanCounts = parsed.per_product ?? {};
    }
  }

  const stats = {
    total_cards: products.length,
    active_cards: products.filter((p) => p.is_active && !p.is_suspended).length,
    ready_stock: products.filter((p) => !p.is_active && !p.pending_review).length,
    pending_review: (pendingRaw ?? []).length,
    total_scans: totalScans,
  };

  const sections: NavSection[] = [
    {
      id: "ringkasan",
      label: "Ringkasan",
      icon: "overview",
      content: <ResellerStats stats={stats} />,
    },
    {
      id: "permohonan",
      label: "Permohonan Aktivasi",
      icon: "inbox",
      badge: stats.pending_review,
      content: <PendingRequests requests={pendingRaw ?? []} />,
    },
    {
      id: "kartu-saya",
      label: "Kartu Saya",
      icon: "cards",
      wide: true,
      content: (
        <InventoryTable
          products={displayedProducts}
          scanCounts={scanCounts}
          totalCount={products.length}
          showResellerColumn={false}
          allowDelete={false}
        />
      ),
    },
  ];

  return (
    <DashboardShell
      title="Dasbor Reseller"
      subtitle={resellerProfile?.name ?? user.email ?? ""}
      sections={sections}
      logoutAction={logout}
    />
  );
}
