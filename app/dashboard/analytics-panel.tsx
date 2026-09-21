"use client";
// app/dashboard/analytics-panel.tsx

import { useEffect, useState } from "react";
import { ScanLine, Smile, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const HEADING = { fontFamily: "var(--font-admin-heading)" };

// Shell kartu ini SAMA persis polanya (glass + shadow berlapis) dengan
// kartu di halaman feedback pelanggan - lihat feedback-card.tsx.
const CARD_SHELL =
  "rounded-2xl border border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(19,35,32,0.03),0_20px_45px_-25px_rgba(19,35,32,0.25)] backdrop-blur-xl";

export function AnalyticsPanel({
  productId,
  totalScans: initialScans,
  totalPositive: initialPositive,
  totalComplaints: initialComplaints,
}: {
  productId: string;
  totalScans: number;
  totalPositive: number;
  totalComplaints: number;
}) {
  const [totalScans, setTotalScans] = useState(initialScans);
  const [totalPositive, setTotalPositive] = useState(initialPositive);
  const [totalComplaints, setTotalComplaints] = useState(initialComplaints);
  const [isLive, setIsLive] = useState(false);

  // Realtime: 1 koneksi WebSocket, cuma "bicara" kalau memang ada
  // baris baru masuk untuk toko INI - jauh lebih hemat dibanding
  // polling (nanya berulang ke server tiap sekian detik walau
  // tidak ada perubahan apa-apa). RLS tetap berlaku di Realtime, jadi
  // owner cuma menerima notifikasi untuk data tokonya sendiri.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`dashboard-${productId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "positive_clicks",
          filter: `product_id=eq.${productId}`,
        },
        () => setTotalPositive((prev) => prev + 1)
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "feedbacks",
          filter: `product_id=eq.${productId}`,
        },
        () => setTotalComplaints((prev) => prev + 1)
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scan_logs",
          filter: `product_id=eq.${productId}`,
        },
        () => setTotalScans((prev) => prev + 1)
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [productId]);

  const totalResponded = totalPositive + totalComplaints;
  const satisfactionRate =
    totalResponded > 0
      ? Math.round((totalPositive / totalResponded) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs text-[#132320]/40">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isLive ? "bg-[var(--brand)]" : "bg-black/20"
          }`}
        />
        {isLive ? "Live - update otomatis" : "Menghubungkan..."}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ScanLine} label="Total Scan" value={totalScans} tone="neutral" />
        <StatCard icon={Smile} label="Puas / Bagus" value={totalPositive} tone="teal" />
        <StatCard
          icon={MessageCircle}
          label="Kurang Puas"
          value={totalComplaints}
          tone="rose"
        />
      </div>

      <div className={`${CARD_SHELL} p-6 text-center`}>
        <p className="text-sm text-[#132320]/50">
          Rasio kepuasan (dari yang memberi respons)
        </p>
        <p className="mt-1 text-3xl font-extrabold text-[#132320]" style={HEADING}>
          {satisfactionRate}%
        </p>
        {totalResponded === 0 && (
          <p className="mt-1 text-xs text-[#132320]/40">
            Belum ada yang klik &quot;Puas&quot; atau kirim keluhan.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ScanLine;
  label: string;
  value: number;
  tone: "teal" | "rose" | "neutral";
}) {
  const styles = {
    teal: {
      color: "var(--brand)",
      bg: "linear-gradient(135deg, var(--brand), var(--brand-dark))",
      iconColor: "#fff",
    },
    rose: { color: "#B5585E", bg: "#FCEEF0", iconColor: "#B5585E" },
    neutral: { color: "#132320", bg: "#F6F8F7", iconColor: "#132320" },
  }[tone];

  return (
    <div className={`${CARD_SHELL} flex flex-col items-center p-5 text-center`}>
      <span
        className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm"
        style={{ background: styles.bg, color: styles.iconColor }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-xs text-[#132320]/50">{label}</p>
      <p
        className="mt-0.5 text-2xl font-extrabold"
        style={{ color: styles.color, fontFamily: "var(--font-admin-heading)" }}
      >
        {value}
      </p>
    </div>
  );
}
