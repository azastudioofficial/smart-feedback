// app/admin/reseller/page.tsx

export const runtime = "edge";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

// ✅ Menggunakan path alias `@/` agar terbaca dengan benar di Cloudflare
import { InventoryTable } from "@/app/admin/master/inventory-table";
import { PendingRequests } from "@/components/pending-requests";
import { ResellerStats } from "./reseller-stats";
import { logout } from "@/app/dashboard/actions";
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
      "id, short_code, business_name, google_review_url, owner_whatsapp, is_active, is_suspended, pending_review, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: pendingRaw } = await supabase
    .from("products")
    .select(
      "id, short_code, business_name, google_review_url, owner_whatsapp, created_at"
    )
    .eq("pending_review", true)
    .order("created_at", { ascending: true });

  const products = myProducts ?? [];
  const productIds = products.map((p) => p.id);
  let scanCounts: Record<string, number> = {};

  if (productIds.length > 0) {
    const { data: scanRows } = await supabase
      .from("scan_logs")
      .select("product_id")
      .in("product_id", productIds);

    scanCounts = (scanRows ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.product_id] = (acc[row.product_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const totalScans = Object.values(scanCounts).reduce((a, b) => a + b, 0);
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
      content: (
        <InventoryTable
          products={products}
          scanCounts={scanCounts}
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
