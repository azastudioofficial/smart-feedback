"use client";
// app/dashboard/owner-dashboard-shell.tsx
//
// Penghubung antara StoreContext (data yang bisa berubah live di
// browser) dan <DashboardShell> (komponen sidebar bersama, dipakai
// juga oleh /admin/master dan /reseller - lihat components/dashboard-shell.tsx).
//
// DashboardShell sengaja TIDAK dibuat bergantung ke useStore()
// langsung, supaya admin/master & reseller (yang TIDAK punya
// StoreProvider) tetap bisa pakai komponen yang sama tanpa error.
// Jadi component KECIL ini yang jadi jembatannya - cuma dipakai di
// dashboard owner.

import { DashboardShell, type NavSection } from "@/components/dashboard-shell";
import { AnalyticsPanel } from "./analytics-panel";
import { FeedbackTable } from "./feedback-table";
import { QrTab } from "./qr-tab";
import { SettingsForm } from "./settings-form";
import { useStore } from "./store-context";

type Product = {
  id: string;
  short_code: string;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  cover_position: string | null;
  brand_color: string | null;
};

type Feedback = {
  id: string;
  customer_name: string | null;
  complaint_text: string;
  photo_path: string | null;
  photo_url: string | null;
  is_anonymous: boolean;
  status: string;
  created_at: string;
};

export function OwnerDashboardShell({
  product,
  feedbacks,
  totalScans,
  totalPositive,
  userEmail,
  logoutAction,
}: {
  product: Product;
  feedbacks: Feedback[];
  totalScans: number;
  totalPositive: number;
  userEmail: string;
  logoutAction: () => void;
}) {
  // businessName/logoUrl/brandColor di sini SELALU nilai TERBARU
  // (bukan snapshot server saat page pertama dibuka) - begitu owner
  // simpan di tab Pengaturan, sidebar & tab Cetak QR ikut berubah
  // seketika, TANPA query ulang ke Supabase.
  const { businessName, logoUrl, brandColor } = useStore();

  const pendingCount = feedbacks.filter((f) => f.status === "Pending").length;

  const sections: NavSection[] = [
    {
      id: "analytics",
      label: "Analytics",
      icon: "overview",
      content: (
        <AnalyticsPanel
          productId={product.id}
          totalScans={totalScans}
          totalPositive={totalPositive}
          totalComplaints={feedbacks.length}
        />
      ),
    },
    {
      id: "keluhan",
      label: "Rekap Keluhan",
      icon: "inbox",
      badge: pendingCount,
      content: <FeedbackTable feedbacks={feedbacks} />,
    },
    {
      id: "qr",
      label: "Cetak QR",
      icon: "qr",
      content: <QrTab shortCode={product.short_code} brandColor={brandColor} />,
    },
    {
      id: "pengaturan",
      label: "Pengaturan Toko",
      icon: "settings",
      content: <SettingsForm product={product} />,
    },
  ];

  return (
    <DashboardShell
      title={businessName ?? "Dashboard"}
      subtitle={userEmail}
      logoUrl={logoUrl}
      sections={sections}
      logoutAction={logoutAction}
    />
  );
}
