"use client";
// app/reseller/reseller-stats.tsx

type Stats = {
  total_cards: number;
  active_cards: number;
  ready_stock: number;
  pending_review: number;
  total_scans: number;
};

const HEADING = { fontFamily: "var(--font-admin-heading)" };

export function ResellerStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <StatCard
        label="Menunggu Persetujuan"
        value={stats.pending_review}
        accent="#B45309"
      />
      <StatCard label="Stok Siap Pakai" value={stats.ready_stock} accent="#B45309" />
      <StatCard label="Kartu Aktif" value={stats.active_cards} accent="#0E7C86" />
      <StatCard label="Total Kartu" value={stats.total_cards} accent="#132320" />
      <StatCard label="Total Scan" value={stats.total_scans} accent="#132320" />
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
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-5 text-center shadow-sm backdrop-blur">
      <p className="text-xs text-[#132320]/50">{label}</p>
      <p className="mt-1 text-2xl font-extrabold" style={{ color: accent, ...HEADING }}>
        {value}
      </p>
    </div>
  );
}
