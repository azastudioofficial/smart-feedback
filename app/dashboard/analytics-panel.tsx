"use client";
// app/dashboard/analytics-panel.tsx
//
// Analytics owner (khusus paket Pro). Server mengirim agregat kecil per
// hari/jam yang dihitung di database (sql/8-owner-analytics.sql, lihat
// app/dashboard/page.tsx); panel ini menurunkan semua angka dari situ di
// browser, lalu memperbaruinya live lewat Realtime. Rumusnya ada di
// lib/analytics.ts (murni, sudah dites terpisah).

import { useEffect, useMemo, useState } from "react";
import {
  ScanLine,
  Star,
  MessageCircle,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Lightbulb,
  Copy,
  Check,
  Share2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "./store-context";
import {
  AreaChart,
  CountUp,
  Funnel,
  Heatmap,
  Sparkline,
} from "./analytics-charts";
import {
  DAY_NAMES,
  buildInsights,
  buildShareText,
  computeAnalytics,
  formatHourRange,
  type AnalyticsResult,
  type ClickBucket,
  type Delta,
  type Insight,
  type Period,
  type ScanBucket,
} from "@/lib/analytics";

const HEADING = { fontFamily: "var(--font-admin-heading)" };

// Kartu gaya SaaS: putih bersih, border tipis, bayangan halus berlapis.
const CARD =
  "rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.12)]";

// Masuk bertahap (stagger) saat panel muncul.
function reveal(i: number, extra = "") {
  return {
    className:
      `${extra} animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none`.trim(),
    style: { animationDelay: `${i * 70}ms`, animationFillMode: "both" as const },
  };
}

const PERIODS: Period[] = [7, 30, 90];

type ComplaintRow = { created_at: string; status: string };

export function AnalyticsPanel({
  productId,
  scanBuckets,
  clickBuckets,
  loadFailed = false,
  feedbacks,
}: {
  productId: string;
  /** Agregat scan 90 hari: [hariWIB, jam, jumlah]. */
  scanBuckets: ScanBucket[];
  /** Agregat klik "Tulis Review di Google Maps": [hariWIB, jumlah]. */
  clickBuckets: ClickBucket[];
  /** true kalau server gagal memuat agregat (mis. SQL belum dijalankan). */
  loadFailed?: boolean;
  /** Pesan pelanggan (keluhan) - dipakai created_at & status-nya. */
  feedbacks: ComplaintRow[];
}) {
  const { businessName } = useStore();

  const [period, setPeriod] = useState<Period>(30);
  const [isLive, setIsLive] = useState(false);
  const [copied, setCopied] = useState(false);

  // Kejadian yang masuk SETELAH halaman dimuat (dari Realtime). Dikosongkan
  // lagi kalau server mengirim data baru (props berganti), supaya tidak
  // terhitung dobel.
  const [liveScans, setLiveScans] = useState<string[]>([]);
  const [liveClicks, setLiveClicks] = useState<string[]>([]);
  const [liveComplaints, setLiveComplaints] = useState<ComplaintRow[]>([]);

  useEffect(() => {
    setLiveScans([]);
    setLiveClicks([]);
    setLiveComplaints([]);
  }, [scanBuckets, clickBuckets, feedbacks]);

  // "Sekarang" baru diisi setelah mount: server & browser tidak boleh
  // menghitung batas hari sendiri-sendiri (bisa beda di sekitar tengah
  // malam -> hydration mismatch).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Realtime: 1 koneksi WebSocket, cuma "bicara" kalau memang ada
  // baris baru masuk untuk toko INI - jauh lebih hemat dibanding
  // polling. RLS tetap berlaku di Realtime, jadi owner cuma menerima
  // notifikasi untuk data tokonya sendiri.
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
        (payload) => {
          const t = payload.new?.created_at;
          setLiveClicks((prev) => [
            ...prev,
            typeof t === "string" ? t : new Date().toISOString(),
          ]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "feedbacks",
          filter: `product_id=eq.${productId}`,
        },
        (payload) => {
          const t = payload.new?.created_at;
          setLiveComplaints((prev) => [
            ...prev,
            {
              created_at:
                typeof t === "string" ? t : new Date().toISOString(),
              status: "Pending",
            },
          ]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scan_logs",
          filter: `product_id=eq.${productId}`,
        },
        (payload) => {
          const t = payload.new?.scanned_at;
          setLiveScans((prev) => [
            ...prev,
            typeof t === "string" ? t : new Date().toISOString(),
          ]);
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [productId]);

  const result = useMemo<AnalyticsResult | null>(() => {
    if (now === null) return null;
    return computeAnalytics({
      now,
      period,
      scanBuckets,
      clickBuckets,
      liveScanTimes: liveScans,
      liveClickTimes: liveClicks,
      complaints: liveComplaints.length
        ? [...feedbacks, ...liveComplaints]
        : feedbacks,
    });
  }, [
    now,
    period,
    scanBuckets,
    clickBuckets,
    feedbacks,
    liveScans,
    liveClicks,
    liveComplaints,
  ]);

  const insights = useMemo(() => (result ? buildInsights(result) : []), [result]);

  const shareText = result
    ? buildShareText(businessName?.trim() || "Toko Anda", result)
    : "";

  function shareWhatsApp() {
    if (!shareText) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function copySummary() {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bisa diblokir browser - diam saja, tombol WhatsApp
      // tetap bisa dipakai.
    }
  }

  const periodIndex = PERIODS.indexOf(period);
  const rangeLabel = result
    ? `${result.daily[0].label} - ${result.daily[result.daily.length - 1].label}`
    : "";

  return (
    <div className="space-y-5">
      {/* Header: rentang tanggal, status live, pilih periode */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-[#132320]/55">
            Performa kartu QR toko Anda
            {rangeLabel && (
              <>
                {" "}
                <span className="text-[#132320]/30">·</span>{" "}
                <span className="font-medium text-[#132320]/70">
                  {rangeLabel}
                </span>
              </>
            )}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-[#132320]/45">
            <span className="relative flex h-2 w-2">
              {isLive && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand)] opacity-50 motion-reduce:animate-none" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  isLive ? "bg-[var(--brand)]" : "bg-black/20"
                }`}
              />
            </span>
            {isLive ? "Live - update otomatis" : "Menyambungkan..."}
          </p>
        </div>

        {/* Segmented control dengan pil yang meluncur */}
        <div
          role="radiogroup"
          aria-label="Periode"
          className="relative grid w-full max-w-[264px] grid-cols-3 rounded-xl bg-black/[0.05] p-1 sm:w-auto"
        >
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc((100%-8px)/3)] rounded-lg bg-white shadow-[0_1px_3px_rgba(16,24,40,0.12)] transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${periodIndex * 100}%)` }}
          />
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`relative z-10 px-4 py-1.5 text-xs font-semibold transition-colors ${
                period === p
                  ? "text-[#132320]"
                  : "text-[#132320]/50 hover:text-[#132320]/80"
              }`}
            >
              {p} hari
            </button>
          ))}
        </div>
      </div>

      {loadFailed && (
        <p
          role="alert"
          className="rounded-xl border border-[#B45309]/25 bg-[#FDF3E7] px-4 py-3 text-sm text-[#132320]/70"
        >
          Data analytics belum bisa dimuat. Coba muat ulang halaman; kalau
          tetap begini, hubungi penyedia layanan.
        </p>
      )}

      {!result ? (
        <Skeleton />
      ) : (
        <>
          {/* KPI + sparkline */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div {...reveal(0, "h-full")}>
              <KpiCard
                icon={ScanLine}
                label="Total Scan"
                value={result.scans}
                delta={result.scansDelta}
                period={result.period}
                accent="#132320"
                spark={result.daily.map((d) => d.scans)}
              />
            </div>
            <div {...reveal(1, "h-full")}>
              <KpiCard
                icon={Star}
                label="Klik Review Google"
                value={result.clicks}
                delta={result.clicksDelta}
                period={result.period}
                accent="var(--brand)"
                spark={result.daily.map((d) => d.clicks)}
                highlight
              />
            </div>
            <div {...reveal(2, "h-full")}>
              <KpiCard
                icon={MessageCircle}
                label="Pesan ke Owner / CS"
                value={result.messages}
                delta={result.messagesDelta}
                period={result.period}
                accent="#C4636B"
                spark={result.daily.map((d) => d.messages)}
                upIsBad
              />
            </div>
            <div {...reveal(3, "h-full")}>
              <KpiCard
                icon={Percent}
                label="Konversi ke Review"
                value={result.conversion}
                suffix="%"
                deltaPts={result.conversionDeltaPts}
                period={result.period}
                accent="var(--brand)"
                progress={result.conversion}
              />
            </div>
          </div>

          {/* Grafik utama */}
          <section {...reveal(4, `${CARD} p-5 sm:p-6`)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-[#132320]" style={HEADING}>
                  Aktivitas Harian
                </h2>
                <p className="mt-0.5 text-xs text-[#132320]/45">
                  Sentuh atau arahkan kursor ke grafik untuk melihat detail per hari
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium text-[#132320]/55">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#132320]/40" />
                  Scan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
                  Klik review
                </span>
              </div>
            </div>

            {result.daily.every((d) => d.scans === 0 && d.clicks === 0) ? (
              <EmptyState
                title="Belum ada aktivitas"
                text={`Belum ada scan dalam ${result.period} hari terakhir. Grafik akan muncul begitu pelanggan mulai scan kartu.`}
              />
            ) : (
              <div className="mt-4">
                <AreaChart daily={result.daily} />
              </div>
            )}

            <dl className="mt-5 grid grid-cols-1 divide-y divide-black/[0.06] border-t border-black/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Fact
                label="Rata-rata scan / hari"
                value={result.scans > 0 ? String(result.avgPerDay).replace(".", ",") : "-"}
              />
              <Fact
                label="Hari terbaik"
                value={result.busiestDay ? result.busiestDay.label : "-"}
                sub={result.busiestDay ? `${result.busiestDay.scans} scan` : undefined}
              />
              <Fact
                label="Jam puncak"
                value={
                  result.peakWeekday !== null && result.peakHour !== null
                    ? formatHourRange(result.peakHour).split("-")[0]
                    : "-"
                }
                sub={
                  result.peakWeekday !== null
                    ? DAY_NAMES[result.peakWeekday]
                    : "Butuh min. 10 scan"
                }
              />
            </dl>
          </section>

          {/* Insight + corong */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section {...reveal(5, `${CARD} p-5 sm:p-6`)}>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: "var(--brand-tint, #E4F1F1)", color: "var(--brand)" }}
                >
                  <Lightbulb className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-[15px] font-bold tracking-tight text-[#132320]" style={HEADING}>
                    Insight untuk Anda
                  </h2>
                  <p className="text-xs text-[#132320]/45">Disusun otomatis dari data toko</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2.5">
                {insights.map((ins, i) => (
                  <InsightRow key={i} insight={ins} />
                ))}
              </ul>
            </section>

            <section {...reveal(6, `${CARD} p-5 sm:p-6`)}>
              <h2 className="text-[15px] font-bold tracking-tight text-[#132320]" style={HEADING}>
                Perjalanan Pelanggan
              </h2>
              <p className="mb-5 mt-0.5 text-xs text-[#132320]/45">
                Apa yang dilakukan pelanggan setelah scan kartu
              </p>
              {result.breakdown.total === 0 ? (
                <EmptyState title="Belum ada scan" text="Data perjalanan pelanggan muncul setelah ada scan pertama." compact />
              ) : (
                <Funnel result={result} />
              )}
            </section>
          </div>

          {/* Peta panas */}
          <section {...reveal(7, `${CARD} p-5 sm:p-6`)}>
            <h2 className="text-[15px] font-bold tracking-tight text-[#132320]" style={HEADING}>
              Jam &amp; Hari Paling Ramai
            </h2>
            <p className="mb-5 mt-0.5 text-xs text-[#132320]/45">
              Kapan pelanggan paling sering scan kartu (WIB)
            </p>
            {result.hasPattern ? (
              <Heatmap result={result} />
            ) : (
              <EmptyState
                title="Pola belum terbentuk"
                text="Peta jam ramai muncul setelah minimal 10 scan pada periode ini."
                compact
              />
            )}
          </section>

          {/* Bagikan laporan */}
          <section
            className={reveal(8, "relative overflow-hidden rounded-2xl p-5 text-white sm:p-6").className}
            style={{
              background: "linear-gradient(135deg, var(--brand), var(--brand-dark))",
              ...reveal(8).style,
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-14 right-16 h-32 w-32 rounded-full bg-white/[0.07]"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-bold" style={HEADING}>
                  <Share2 className="h-4 w-4" />
                  Bagikan laporan {result.period} hari
                </p>
                <p className="mt-1 text-xs text-white/75">
                  Kirim ringkasan ini ke diri sendiri, tim, atau pemilik usaha lewat WhatsApp.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={shareWhatsApp}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-[#132320] shadow-sm transition hover:bg-white/90"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Kirim via WhatsApp
                </button>
                <button
                  type="button"
                  onClick={copySummary}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/35 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/10"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Tersalin" : "Salin ringkasan"}
                </button>
              </div>
            </div>
          </section>

          <p className="px-1 text-[11px] leading-relaxed text-[#132320]/40">
            Data scan &amp; klik review disimpan 90 hari, pesan pelanggan 30
            hari. &quot;Klik Review Google&quot; menghitung berapa kali tombol
            ditekan, bukan jumlah ulasan yang benar-benar terbit di Google.
            Waktu ditampilkan dalam WIB.
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Skeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${CARD} h-[148px] animate-pulse`} />
        ))}
      </div>
      <div className={`${CARD} h-[330px] animate-pulse`} />
    </div>
  );
}

function EmptyState({
  title,
  text,
  compact = false,
}: {
  title: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-6" : "py-12"}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.04] text-[#132320]/35">
        <Activity className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-[#132320]/70">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#132320]/45">{text}</p>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-1 py-3 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-[11px] font-medium text-[#132320]/45">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-lg font-extrabold tabular-nums text-[#132320]" style={HEADING}>
          {value}
        </span>
        {sub && <span className="text-[11px] text-[#132320]/45">{sub}</span>}
      </dd>
    </div>
  );
}

const INSIGHT_STYLE: Record<
  Insight["tone"],
  { bg: string; fg: string; ring: string }
> = {
  good: { bg: "#E8F5EE", fg: "#1F7A4D", ring: "rgba(31,122,77,0.14)" },
  warn: { bg: "#FDF3E7", fg: "#B45309", ring: "rgba(180,83,9,0.16)" },
  info: { bg: "#F1F4F3", fg: "#4B5B57", ring: "rgba(19,35,32,0.08)" },
};

function InsightRow({ insight }: { insight: Insight }) {
  const st = INSIGHT_STYLE[insight.tone];
  const Icon =
    insight.kind === "trend"
      ? Activity
      : insight.kind === "peak"
        ? Clock
        : insight.kind === "conversion"
          ? Star
          : insight.kind === "complaint"
            ? insight.tone === "warn"
              ? AlertCircle
              : CheckCircle2
            : Lightbulb;

  return (
    <li
      className="flex items-start gap-3 rounded-xl p-3 text-[13px] leading-relaxed text-[#132320]/75"
      style={{ backgroundColor: st.bg, boxShadow: `inset 0 0 0 1px ${st.ring}` }}
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white"
        style={{ color: st.fg }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span>{insight.text}</span>
    </li>
  );
}

function DeltaChip({
  delta,
  pts,
  upIsBad = false,
  period,
}: {
  delta?: Delta;
  pts?: number | null;
  upIsBad?: boolean;
  period: Period;
}) {
  const value = pts !== undefined ? pts : delta?.pct ?? null;

  if (value === null) {
    return <span className="text-[11px] text-[#132320]/30">Belum ada pembanding</span>;
  }
  if (value === 0) {
    return <span className="text-[11px] text-[#132320]/45">Sama seperti {period} hari lalu</span>;
  }

  const up = value > 0;
  const good = up !== upIsBad;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const label = pts !== undefined ? `${Math.abs(value)} poin` : `${Math.abs(value)}%`;

  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
        style={{
          color: good ? "#1F7A4D" : "#B5585E",
          backgroundColor: good ? "#E8F5EE" : "#FCEEF0",
        }}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="text-[11px] text-[#132320]/35">vs {period} hari lalu</span>
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  delta,
  deltaPts,
  upIsBad,
  period,
  accent,
  spark,
  progress,
  highlight = false,
}: {
  icon: typeof ScanLine;
  label: string;
  value: number;
  suffix?: string;
  delta?: Delta;
  deltaPts?: number | null;
  upIsBad?: boolean;
  period: Period;
  accent: string;
  spark?: number[];
  progress?: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`${CARD} group flex h-full flex-col p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_18px_40px_-16px_rgba(16,24,40,0.2)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5`}
      style={highlight ? { boxShadow: "0 0 0 1.5px var(--brand), 0 14px 34px -16px var(--brand)" } : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: accent }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="min-w-0 text-[12px] font-medium leading-tight text-[#132320]/60">{label}</p>
      </div>

      <p
        className="mt-3 text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-[#132320] sm:text-[32px]"
        style={HEADING}
      >
        <CountUp value={value} suffix={suffix} />
      </p>

      <div className="mt-2 min-h-[22px]">
        <DeltaChip delta={delta} pts={deltaPts} upIsBad={upIsBad} period={period} />
      </div>

      <div className="mt-auto pt-3">
        {spark && <Sparkline values={spark} color={accent} />}
        {progress !== undefined && (
          <div className="flex h-8 items-end">
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{
                  width: `${Math.min(100, Math.max(progress > 0 ? 2 : 0, progress))}%`,
                  background: "linear-gradient(90deg, var(--brand), var(--brand-dark))",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
