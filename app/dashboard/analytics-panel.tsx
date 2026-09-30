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
  Lightbulb,
  Copy,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "./store-context";
import {
  DAY_NAMES,
  DAY_SHORT,
  buildInsights,
  buildShareText,
  computeAnalytics,
  formatHourRange,
  type AnalyticsResult,
  type ClickBucket,
  type Delta,
  type Period,
  type ScanBucket,
} from "@/lib/analytics";

const HEADING = { fontFamily: "var(--font-admin-heading)" };

// Shell kartu ini SAMA persis polanya (glass + shadow berlapis) dengan
// kartu di halaman feedback pelanggan - lihat feedback-card.tsx.
const CARD_SHELL =
  "rounded-2xl border border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(19,35,32,0.03),0_20px_45px_-25px_rgba(19,35,32,0.25)] backdrop-blur-xl";

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

  return (
    <div className="space-y-4">
      {/* Bar atas: status live, pilih periode, bagikan */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-[#132320]/50">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLive ? "bg-[var(--brand)]" : "bg-black/20"
            }`}
          />
          {isLive ? "Live - update otomatis" : "Menyambungkan..."}
        </p>

        <div
          role="radiogroup"
          aria-label="Periode"
          className="inline-flex rounded-xl bg-black/[0.05] p-1"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                period === p
                  ? "bg-white text-[#132320] shadow-sm"
                  : "text-[#132320]/55 hover:text-[#132320]"
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
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={ScanLine}
              label="Total Scan"
              value={String(result.scans)}
              delta={result.scansDelta}
              tone="neutral"
            />
            <StatCard
              icon={Star}
              label="Klik Review Google"
              value={String(result.clicks)}
              delta={result.clicksDelta}
              tone="brand"
            />
            <StatCard
              icon={MessageCircle}
              label="Pesan ke Owner / CS"
              value={String(result.messages)}
              delta={result.messagesDelta}
              tone="rose"
              upIsBad
            />
            <StatCard
              icon={Percent}
              label="Konversi ke Review"
              value={`${result.conversion}%`}
              deltaPts={result.conversionDeltaPts}
              tone="brand"
            />
          </div>

          {/* Insight otomatis */}
          <div className={`${CARD_SHELL} p-5`}>
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: "var(--brand-tint, #E4F1F1)", color: "var(--brand)" }}
              >
                <Lightbulb className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-bold text-[#132320]" style={HEADING}>
                Ringkasan untuk Anda
              </h2>
            </div>
            <ul className="mt-3 space-y-2.5">
              {insights.map((ins, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-[#132320]/75">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        ins.tone === "good"
                          ? "#2E9E6B"
                          : ins.tone === "warn"
                            ? "#C7852B"
                            : "rgba(19,35,32,0.3)",
                    }}
                  />
                  {ins.text}
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.06] pt-4">
              <button
                type="button"
                onClick={shareWhatsApp}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--brand-dark)]"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Bagikan via WhatsApp
              </button>
              <button
                type="button"
                onClick={copySummary}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.1] px-3.5 py-2 text-xs font-semibold text-[#132320]/70 transition hover:bg-black/[0.03]"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Tersalin" : "Salin ringkasan"}
              </button>
            </div>
          </div>

          {/* Grafik harian */}
          <div className={`${CARD_SHELL} p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-[#132320]" style={HEADING}>
                Aktivitas Harian
              </h2>
              <div className="flex items-center gap-3 text-[11px] text-[#132320]/50">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-[var(--brand)] opacity-30" />
                  Scan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-[var(--brand)]" />
                  Klik review
                </span>
              </div>
            </div>
            <DailyChart result={result} />
          </div>

          {/* Setelah scan, pelanggan ngapain? */}
          <div className={`${CARD_SHELL} p-5`}>
            <h2 className="text-sm font-bold text-[#132320]" style={HEADING}>
              Setelah Scan, Pelanggan Melakukan Apa?
            </h2>
            <Breakdown result={result} />
          </div>

          {/* Jam & hari ramai */}
          <div className={`${CARD_SHELL} p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-[#132320]" style={HEADING}>
                Jam &amp; Hari Paling Ramai
              </h2>
              {result.hasPattern &&
                result.peakWeekday !== null &&
                result.peakHour !== null && (
                  <p className="text-xs font-medium text-[var(--brand)]">
                    Puncak: {DAY_NAMES[result.peakWeekday]},{" "}
                    {formatHourRange(result.peakHour)}
                  </p>
                )}
            </div>
            <Heatmap result={result} />
          </div>

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
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${CARD_SHELL} h-[118px] animate-pulse`} />
        ))}
      </div>
      <div className={`${CARD_SHELL} h-40 animate-pulse`} />
    </div>
  );
}

function DeltaChip({
  delta,
  pts,
  upIsBad = false,
}: {
  delta?: Delta;
  pts?: number | null;
  upIsBad?: boolean;
}) {
  const value = pts !== undefined ? pts : delta?.pct ?? null;
  if (value === null || value === 0) return null;

  const up = value > 0;
  const good = up !== upIsBad;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const label =
    pts !== undefined
      ? `${Math.abs(value)} poin`
      : `${Math.abs(value)}%`;

  return (
    <span
      className="mt-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        color: good ? "#1F7A4D" : "#B5585E",
        backgroundColor: good ? "#E8F5EE" : "#FCEEF0",
      }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaPts,
  upIsBad,
  tone,
}: {
  icon: typeof ScanLine;
  label: string;
  value: string;
  delta?: Delta;
  deltaPts?: number | null;
  upIsBad?: boolean;
  tone: "brand" | "rose" | "neutral";
}) {
  const styles = {
    brand: {
      color: "var(--brand)",
      bg: "linear-gradient(135deg, var(--brand), var(--brand-dark))",
      iconColor: "#fff",
    },
    rose: { color: "#B5585E", bg: "#FCEEF0", iconColor: "#B5585E" },
    neutral: { color: "#132320", bg: "#F6F8F7", iconColor: "#132320" },
  }[tone];

  return (
    <div className={`${CARD_SHELL} flex flex-col items-center p-4 text-center`}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
        style={{ background: styles.bg, color: styles.iconColor }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-2.5 text-[11px] leading-tight text-[#132320]/50">{label}</p>
      <p
        className="mt-0.5 text-2xl font-extrabold"
        style={{ color: styles.color, ...HEADING }}
      >
        {value}
      </p>
      <DeltaChip delta={delta} pts={deltaPts} upIsBad={upIsBad} />
    </div>
  );
}

function DailyChart({ result }: { result: AnalyticsResult }) {
  const { daily, maxDaily, period } = result;

  if (maxDaily === 0) {
    return (
      <p className="py-10 text-center text-sm text-[#132320]/40">
        Belum ada aktivitas pada {period} hari terakhir.
      </p>
    );
  }

  const pct = (n: number) => `${Math.max(n > 0 ? 3 : 0, (n / maxDaily) * 100)}%`;
  const mid = daily[Math.floor(daily.length / 2)];

  return (
    <div className="mt-4">
      <div className="flex">
        {/* Sumbu Y sederhana */}
        <div className="flex h-40 w-7 shrink-0 flex-col justify-between pr-1 text-right text-[10px] text-[#132320]/35">
          <span>{maxDaily}</span>
          <span>{Math.round(maxDaily / 2)}</span>
          <span>0</span>
        </div>

        <div className="relative h-40 min-w-0 flex-1">
          {/* Garis bantu */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <div className="border-t border-dashed border-black/[0.07]" />
            <div className="border-t border-dashed border-black/[0.07]" />
            <div className="border-t border-black/[0.1]" />
          </div>

          <div className="relative flex h-full items-end gap-[2px]">
            {daily.map((d) => (
              <div
                key={d.dayIdx}
                title={`${d.label}: ${d.scans} scan, ${d.clicks} klik review`}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-[1px]"
              >
                <div
                  className="w-1/2 max-w-[10px] rounded-t-[2px] bg-[var(--brand)] opacity-30"
                  style={{ height: pct(d.scans) }}
                />
                <div
                  className="w-1/2 max-w-[10px] rounded-t-[2px] bg-[var(--brand)]"
                  style={{ height: pct(d.clicks) }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ml-7 mt-1.5 flex justify-between text-[10px] text-[#132320]/40">
        <span>{daily[0].label}</span>
        <span>{mid.label}</span>
        <span>{daily[daily.length - 1].label}</span>
      </div>
    </div>
  );
}

function Breakdown({ result }: { result: AnalyticsResult }) {
  const { review, message, idle, total } = result.breakdown;

  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-[#132320]/40">
        Belum ada scan pada periode ini.
      </p>
    );
  }

  const p = (n: number) => Math.round((n / total) * 100);
  const rows = [
    { label: "Membuka Google Review", n: review, color: "var(--brand)" },
    { label: "Mengirim pesan ke owner / CS", n: message, color: "#B5585E" },
    { label: "Hanya melihat halaman", n: idle, color: "rgba(19,35,32,0.18)" },
  ];

  return (
    <div className="mt-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-black/[0.05]">
        {rows.map((r) =>
          r.n > 0 ? (
            <div
              key={r.label}
              style={{ width: `${(r.n / total) * 100}%`, backgroundColor: r.color }}
              title={`${r.label}: ${r.n}`}
            />
          ) : null
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: r.color }}
            />
            <span className="flex-1 text-[#132320]/70">{r.label}</span>
            <span className="font-semibold text-[#132320]">{r.n}</span>
            <span className="w-10 text-right text-xs text-[#132320]/45">
              {p(r.n)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Heatmap({ result }: { result: AnalyticsResult }) {
  const { heat, maxHeat, hasPattern } = result;

  if (!hasPattern) {
    return (
      <p className="py-6 text-center text-sm text-[#132320]/40">
        Pola jam ramai muncul setelah minimal 10 scan pada periode ini.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {/* Label jam */}
      <div className="flex items-center gap-1">
        <span className="w-8 shrink-0" />
        <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className="text-center text-[9px] leading-none text-[#132320]/35"
            >
              {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-1 space-y-[2px]">
        {heat.map((row, w) => (
          <div key={w} className="flex items-center gap-1">
            <span className="w-8 shrink-0 text-[10px] text-[#132320]/45">
              {DAY_SHORT[w]}
            </span>
            <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
              {row.map((v, h) =>
                v === 0 ? (
                  <div
                    key={h}
                    className="aspect-square rounded-[3px] bg-black/[0.04]"
                    title={`${DAY_NAMES[w]} ${formatHourRange(h)}: 0 scan`}
                  />
                ) : (
                  <div
                    key={h}
                    className="aspect-square rounded-[3px] bg-[var(--brand)]"
                    style={{ opacity: 0.2 + 0.8 * (v / maxHeat) }}
                    title={`${DAY_NAMES[w]} ${formatHourRange(h)}: ${v} scan`}
                  />
                )
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-[#132320]/40">
        Sedikit
        <span className="h-2 w-2 rounded-[2px] bg-[var(--brand)] opacity-20" />
        <span className="h-2 w-2 rounded-[2px] bg-[var(--brand)] opacity-50" />
        <span className="h-2 w-2 rounded-[2px] bg-[var(--brand)]" />
        Banyak
      </div>
    </div>
  );
}
