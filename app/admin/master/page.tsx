// app/admin/master/page.tsx

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { BatchGenerator } from "./batch-generator";
import { InventoryTable } from "./inventory-table";
import { StatsOverview } from "./stats-overview";
import { SystemHealth } from "./system-health";
import { ResellerManager } from "./reseller-manager";
import { getDashboardStats } from "./actions";
import { logout } from "../../dashboard/actions";
import { PendingRequests } from "@/components/pending-requests";
import { DashboardShell, type NavSection } from "@/components/dashboard-shell";

export default async function AdminMasterPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isSuperAdmin = user.app_metadata?.role === "super_admin";
  if (!isSuperAdmin) {
    redirect("/dashboard");
  }

  const [{ data: products, count: totalCount }, { data: pendingRaw }, statsResult] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, short_code, business_name, google_review_url, owner_whatsapp, is_active, is_suspended, pending_review, created_at, resellers(name)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(0, 24), // halaman pertama saja (25 baris) - sisanya lewat pagination
      supabase
        .from("products")
        .select(
          "id, short_code, business_name, google_review_url, owner_whatsapp, created_at"
        )
        .eq("pending_review", true)
        .order("created_at", { ascending: true }),
      getDashboardStats(),
    ]);

  const stats = statsResult.data ?? {
    total_cards: 0,
    active_cards: 0,
    ready_stock: 0,
    pending_review: 0,
    total_scans: 0,
    trend: [],
    scan_counts: {},
  };

  const inventoryItems = (products ?? []).map((p) => ({
    ...p,
    reseller_name:
      (p as unknown as { resellers?: { name: string } | null }).resellers
        ?.name ?? null,
  }));

  const sections: NavSection[] = [
    {
      id: "ringkasan",
      label: "Ringkasan",
      icon: "overview",
      content: <StatsOverview stats={stats} />,
    },
    {
      id: "permohonan",
      label: "Permohonan Aktivasi",
      icon: "inbox",
      badge: stats.pending_review,
      content: <PendingRequests requests={pendingRaw ?? []} />,
    },
    {
      id: "buat-stok",
      label: "Buat Stok QR",
      icon: "create",
      content: <BatchGenerator />,
    },
    {
      id: "semua-kartu",
      label: "Semua Kartu",
      icon: "cards",
      content: (
        <InventoryTable
          products={inventoryItems}
          scanCounts={stats.scan_counts}
          totalCount={totalCount ?? inventoryItems.length}
          showResellerColumn
          allowDelete
        />
      ),
    },
    {
      id: "reseller",
      label: "Kelola Reseller",
      icon: "users",
      content: <ResellerManager />,
    },
    {
      id: "system-health",
      label: "System Health",
      icon: "health",
      content: <SystemHealth />,
    },
  ];

  return (
    <DashboardShell
      title="Dasbor Admin"
      subtitle={user.email ?? ""}
      sections={sections}
      logoutAction={logout}
    />
  );
}
