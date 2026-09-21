"use client";
// app/admin/master/stats-overview.tsx

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type Stats = {
  total_cards: number;
  active_cards: number;
  ready_stock: number;
  pending_review: number;
  total_scans: number;
  trend: { day: string; total: number }[];
};

const HEADING = { fontFamily: "var(--font-admin-heading)" };

export function StatsOverview({ stats }: { stats: Stats }) {
  const chartData = stats.trend.map((t) => ({
    label: new Date(t.day).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
    }),
    total: t.total,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Menunggu Persetujuan" value={stats.pending_review} accent="#B45309" />
        <StatCard label="Stok Siap Pakai" value={stats.ready_stock} accent="#B45309" />
        <StatCard label="Kartu Aktif" value={stats.active_cards} accent="#0E7C86" />
        <StatCard label="Total Kartu" value={stats.total_cards} accent="#132320" />
        <StatCard label="Total Scan" value={stats.total_scans} accent="#132320" />
      </div>

      <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-6 shadow-sm backdrop-blur">
        <h2 className="text-base font-extrabold text-[#132320]" style={HEADING}>
          Tren Scan (7 Hari Terakhir)
        </h2>
        <div className="mt-4 h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0E7C86" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0E7C86" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#132320" strokeOpacity={0.06} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#132320", fillOpacity: 0.5 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#132320", fillOpacity: 0.5 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgba(19,35,32,0.08)",
                  fontFamily: "var(--font-admin-body)",
                  fontSize: 13,
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#0E7C86"
                strokeWidth={2.5}
                fill="url(#scanFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-5 shadow-sm backdrop-blur">
      <p className="text-xs text-[#132320]/50">{label}</p>
      <p
        className="mt-1 text-3xl font-extrabold"
        style={{ color: accent, fontFamily: "var(--font-admin-heading)" }}
      >
        {value}
      </p>
    </div>
  );
}
