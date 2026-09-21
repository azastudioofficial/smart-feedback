"use client";
// app/admin/master/system-health.tsx

import { useEffect, useState } from "react";

type HealthData = {
  cloudinary: {
    credits_used: number;
    credits_limit: number;
    credits_percent: number;
    storage_mb: number;
    bandwidth_mb: number;
  } | null;
  database: {
    used_mb: number;
    limit_mb: number;
    percent: number;
  } | null;
  cron: {
    last_run_at: string | null;
    last_run_summary: unknown;
    status: "active" | "stale" | "never_run";
  };
};

const HEADING = { fontFamily: "var(--font-admin-heading)" };

// Ambang batas warna sesuai permintaan: hijau <70%, kuning 70-85%, merah >85%
function thresholdColor(percent: number): string {
  if (percent > 85) return "#B5585E";
  if (percent >= 70) return "#B45309";
  return "#0E7C86";
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 1000 / 60 / 60);
  if (hours < 1) return "kurang dari 1 jam lalu";
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function SystemHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/system-health");
        if (!res.ok) throw new Error("Gagal memuat status sistem.");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-6 shadow-sm backdrop-blur">
      <h2 className="text-lg font-extrabold text-[#132320]" style={HEADING}>
        System Health
      </h2>
      <p className="mt-0.5 text-[13px] text-[#132320]/50">
        Pantauan kuota layanan pihak ketiga & status pembersihan otomatis.
      </p>

      {loading && (
        <p className="mt-4 text-sm text-[#132320]/50">Memuat status...</p>
      )}
      {error && <p className="mt-4 text-sm text-[#B5585E]">{error}</p>}

      {data && (
        <div className="mt-5 space-y-5">
          {/* Cloudinary */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-[#132320]">
                Penyimpanan Foto (Cloudinary)
              </span>
              {data.cloudinary && (
                <span
                  className="font-semibold"
                  style={{ color: thresholdColor(data.cloudinary.credits_percent) }}
                >
                  {data.cloudinary.credits_percent}%
                </span>
              )}
            </div>
            {data.cloudinary ? (
              <>
                <ProgressBar
                  percent={data.cloudinary.credits_percent}
                  color={thresholdColor(data.cloudinary.credits_percent)}
                />
                <p className="mt-1 text-xs text-[#132320]/50">
                  {data.cloudinary.credits_used} / {data.cloudinary.credits_limit}{" "}
                  credits &middot; Storage {data.cloudinary.storage_mb} MB &middot;
                  Bandwidth {data.cloudinary.bandwidth_mb} MB (bulan ini)
                </p>
              </>
            ) : (
              <p className="text-xs text-[#132320]/40">
                Data tidak tersedia - cek CLOUDINARY_API_KEY/SECRET di environment.
              </p>
            )}
          </div>

          {/* Supabase DB */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-[#132320]">
                Database Teks (Supabase)
              </span>
              {data.database && (
                <span
                  className="font-semibold"
                  style={{ color: thresholdColor(data.database.percent) }}
                >
                  {data.database.percent}%
                </span>
              )}
            </div>
            {data.database ? (
              <>
                <ProgressBar
                  percent={data.database.percent}
                  color={thresholdColor(data.database.percent)}
                />
                <p className="mt-1 text-xs text-[#132320]/50">
                  {data.database.used_mb} MB / {data.database.limit_mb} MB
                </p>
              </>
            ) : (
              <p className="text-xs text-[#132320]/40">Data tidak tersedia.</p>
            )}
          </div>

          {/* Status cron */}
          <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#132320]">
                Cron Pembersihan 30 Hari
              </p>
              <p className="text-xs text-[#132320]/50">
                {data.cron.status === "never_run" && "Belum pernah jalan"}
                {data.cron.status === "active" &&
                  data.cron.last_run_at &&
                  `Terakhir jalan ${formatRelativeTime(data.cron.last_run_at)}`}
                {data.cron.status === "stale" &&
                  data.cron.last_run_at &&
                  `Terlambat - terakhir jalan ${formatRelativeTime(
                    data.cron.last_run_at
                  )}`}
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor:
                  data.cron.status === "active"
                    ? "#0E7C8620"
                    : data.cron.status === "stale"
                    ? "#B4530920"
                    : "#B5585E20",
                color:
                  data.cron.status === "active"
                    ? "#0E7C86"
                    : data.cron.status === "stale"
                    ? "#B45309"
                    : "#B5585E",
              }}
            >
              {data.cron.status === "active" && "Aktif"}
              {data.cron.status === "stale" && "Terlambat"}
              {data.cron.status === "never_run" && "Belum Aktif"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
