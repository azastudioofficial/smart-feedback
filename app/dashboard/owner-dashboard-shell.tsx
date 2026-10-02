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
import type { SocialLink } from "@/lib/social-links";
import type { ScanBucket, ClickBucket } from "@/lib/analytics";
import { Lock } from "lucide-react";

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
  social_links?: SocialLink[] | null;
  connect_title?: string | null;
  connect_description?: string | null;
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
  isPro,
  feedbacks,
  scanBuckets,
  clickBuckets,
  analyticsFailed,
  userEmail,
  logoutAction,
}: {
  product: Product;
  // Basic: cuma boleh lihat & ubah Pengaturan Toko. Analytics/Rekap
  // Keluhan/Cetak QR semuanya alur khusus Pro (lihat komentar di
  // app/dashboard/page.tsx untuk alasan gerbangnya dipindah ke sini).
  isPro: boolean;
  feedbacks: Feedback[];
  scanBuckets: ScanBucket[];
  clickBuckets: ClickBucket[];
  analyticsFailed: boolean;
  userEmail: string;
  logoutAction: () => void;
}) {
  // businessName/logoUrl/brandColor di sini SELALU nilai TERBARU
  // (bukan snapshot server saat page pertama dibuka) - begitu owner
  // simpan di tab Pengaturan, sidebar & tab Cetak QR ikut berubah
  // seketika, TANPA query ulang ke Supabase.
  const { businessName, logoUrl, brandColor } = useStore();

  const pendingCount = feedbacks.filter((f) => f.status === "Pending").length;

  const settingsContent = (
    <>
      {!isPro && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#B45309]/25 bg-[#FDF3E7] p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#B45309]">
            <Lock className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed text-[#132320]/70">
            <span className="font-semibold text-[#132320]">
              Paket Basic aktif.
            </span>{" "}
            Anda tetap bisa mengubah data toko di bawah ini (nama, link
            Google Review, WhatsApp, dsb). Analytics, Rekap Keluhan, dan
            Cetak QR hanya tersedia di paket Pro - hubungi penyedia
            layanan untuk upgrade.
          </p>
        </div>
      )}
      <SettingsForm product={product} isPro={isPro} />
    </>
  );

  // Basic cuma dikasih 1 tab (Pengaturan Toko). Sengaja TIDAK dikunci
  // total seperti sebelumnya, supaya owner Basic tetap bisa perbarui
  // data tokonya sendiri kapan saja tanpa minta bantuan admin.
  const sections: NavSection[] = isPro
    ? [
        {
          id: "analytics",
          label: "Analytics",
          icon: "overview",
          content: (
            <AnalyticsPanel
              productId={product.id}
              scanBuckets={scanBuckets}
              clickBuckets={clickBuckets}
              loadFailed={analyticsFailed}
              feedbacks={feedbacks}
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
          content: (
            <QrTab shortCode={product.short_code} brandColor={brandColor} />
          ),
        },
        {
          id: "pengaturan",
          label: "Pengaturan Toko",
          icon: "settings",
          content: settingsContent,
        },
      ]
    : [
        {
          id: "pengaturan",
          label: "Pengaturan Toko",
          icon: "settings",
          content: settingsContent,
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
