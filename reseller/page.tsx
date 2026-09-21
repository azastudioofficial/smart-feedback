// app/reseller/page.tsx

export const runtime = "edge";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { InventoryTable } from "../admin/master/inventory-table";
import { PendingRequests } from "@/components/pending-requests";
import { logout } from "../dashboard/actions";
import { Button } from "@/components/ui/button";

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

  // Hitung scan per kartu (RLS scan_logs sudah mengizinkan reseller)
  const productIds = (myProducts ?? []).map((p) => p.id);
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

  return (
    <main
      className="min-h-screen bg-[#F6F8F7] px-4 py-8"
      style={{ fontFamily: "var(--font-admin-body)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-extrabold text-[#132320]"
              style={{ fontFamily: "var(--font-admin-heading)" }}
            >
              Dasbor Reseller
            </h1>
            <p className="text-sm text-[#132320]/50">
              {resellerProfile?.name ?? user.email}
            </p>
          </div>
          <form action={logout}>
            <Button
              type="submit"
              variant="outline"
              className="border-[#132320]/15"
            >
              Logout
            </Button>
          </form>
        </div>

        <div className="space-y-6">
          <PendingRequests requests={pendingRaw ?? []} />
          <InventoryTable
            products={myProducts ?? []}
            scanCounts={scanCounts}
            showResellerColumn={false}
            allowDelete={false}
          />
        </div>
      </div>
    </main>
  );
}
