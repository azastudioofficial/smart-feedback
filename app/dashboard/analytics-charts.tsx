"use client";
// app/dashboard/analytics-charts.tsx
//
// Komponen grafik untuk tab Analytics - semuanya SVG/HTML murni tanpa
// library grafik (tidak menambah ukuran bundle). Warna mengikuti
// --brand toko, jadi tampilannya ikut berubah saat owner ganti warna.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DAY_NAMES,
  DAY_SHORT,
  formatHourRange,
  type AnalyticsResult,
  type DailyPoint,
} from "@/lib/analytics";

const INK = "#132320";

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number };

/** Kurva halus monoton (Fritsch-Carlson): mulus tapi tidak "melenting"
 *  di bawah nol seperti spline biasa. */
function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  if (n === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const t: number[] = new Array<number>(n).fill(0);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${
      pts[i + 1].y - t[i + 1] * h
    } ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/** Langkah sumbu Y yang "bulat": 1, 2, 5, 10, 20, 50, ... */
function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const f of [1, 2, 5, 10]) {
    if (f * mag >= raw) return f * mag;
  }
  return 10 * mag;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** true setelah 1 frame - dipakai untuk memicu transisi "tumbuh". */
function useMountedFlag() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/* ------------------------------------------------------------------ */
/* Angka berhitung naik                                                */
/* ------------------------------------------------------------------ */

export function CountUp({
  value,
  suffix = "",
  duration = 700,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (value - from) * eased);
      fromRef.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <>
      {shown.toLocaleString("id-ID")}
      {suffix}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline mini di kartu KPI                                         */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  const uid = useId().replace(/:/g, "");
  const n = values.length;
  if (n === 0) return null;

  const W = 100;
  const H = 32;
  const pad = 3;
  const max = Math.max(...values, 1);
  const flat = values.every((v) => v === 0);
  const pts: Pt[] = values.map((v, i) => ({
    x: n === 1 ? W / 2 : (i * W) / (n - 1),
    y: H - pad - (v / max) * (H - pad * 2),
  }));
  const line = smoothPath(pts);
  const area = `${line} L${pts[n - 1].x},${H} L${pts[0].x},${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-8 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={`sp-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.26 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {!flat && <path d={area} fill={`url(#sp-${uid})`} />}
      <path
        d={line}
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ stroke: color, opacity: flat ? 0.25 : 1 }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Grafik area interaktif                                              */
/* ------------------------------------------------------------------ */

export function AreaChart({ daily }: { daily: DailyPoint[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  const H = 236;
  const pad = { l: 34, r: 12, t: 16, b: 28 };
  const n = daily.length;

  const maxVal = Math.max(1, ...daily.map((d) => Math.max(d.scans, d.clicks)));
  const step = niceStep(maxVal / 4);
  const yMax = step * 4;

  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => (n === 1 ? pad.l + iw / 2 : pad.l + (i * iw) / (n - 1));
  const y = (v: number) => pad.t + ih - (v / yMax) * ih;
  const base = pad.t + ih;

  const scanPts: Pt[] = daily.map((d, i) => ({ x: x(i), y: y(d.scans) }));
  const clickPts: Pt[] = daily.map((d, i) => ({ x: x(i), y: y(d.clicks) }));
  const scanLine = smoothPath(scanPts);
  const clickLine = smoothPath(clickPts);
  const scanArea = n > 0 ? `${scanLine} L${scanPts[n - 1].x},${base} L${scanPts[0].x},${base} Z` : "";
  const clickArea = n > 0 ? `${clickLine} L${clickPts[n - 1].x},${base} L${clickPts[0].x},${base} Z` : "";

  const labelIdx =
    n <= 8
      ? daily.map((_, i) => i)
      : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)));

  function onMove(e: ReactPointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = n === 1 ? 0 : Math.round((px / iw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  }

  const hp = hover !== null ? daily[hover] : null;
  const tipLeft =
    hover !== null ? Math.min(Math.max(x(hover) - 84, 4), Math.max(4, width - 172)) : 0;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: H }}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Grafik scan dan klik review per hari"
          className="overflow-visible"
        >
          <defs>
            <linearGradient id={`ar-scan-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: INK, stopOpacity: 0.1 }} />
              <stop offset="1" style={{ stopColor: INK, stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={`ar-click-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--brand)", stopOpacity: 0.32 }} />
              <stop offset="1" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {/* Garis bantu + label sumbu Y */}
          {[0, 1, 2, 3, 4].map((k) => {
            const yy = y(step * k);
            return (
              <g key={k}>
                <line
                  x1={pad.l}
                  x2={width - pad.r}
                  y1={yy}
                  y2={yy}
                  stroke={INK}
                  strokeOpacity={k === 0 ? 0.14 : 0.06}
                  strokeDasharray={k === 0 ? undefined : "3 4"}
                />
                <text
                  x={pad.l - 8}
                  y={yy + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill={INK}
                  fillOpacity={0.38}
                >
                  {step * k}
                </text>
              </g>
            );
          })}

          {/* Area + garis */}
          <g className="animate-in fade-in duration-700 motion-reduce:animate-none">
            <path d={scanArea} fill={`url(#ar-scan-${uid})`} />
            <path
              d={scanLine}
              fill="none"
              stroke={INK}
              strokeOpacity={0.4}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d={clickArea} fill={`url(#ar-click-${uid})`} />
            <path
              d={clickLine}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: "var(--brand)" }}
            />
          </g>

          {/* Label sumbu X */}
          {labelIdx.map((i, k) => (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={k === 0 && n > 8 ? "start" : k === labelIdx.length - 1 && n > 8 ? "end" : "middle"}
              fontSize="10"
              fill={INK}
              fillOpacity={0.4}
            >
              {daily[i].label}
            </text>
          ))}

          {/* Penunjuk saat disentuh / di-hover */}
          {hover !== null && hp && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.t}
                y2={base}
                stroke={INK}
                strokeOpacity={0.18}
              />
              <circle cx={x(hover)} cy={y(hp.scans)} r={4} fill="#fff" stroke={INK} strokeOpacity={0.55} strokeWidth={2} />
              <circle
                cx={x(hover)}
                cy={y(hp.clicks)}
                r={4.5}
                fill="#fff"
                strokeWidth={2.5}
                style={{ stroke: "var(--brand)" }}
              />
            </g>
          )}

          <rect
            x={pad.l}
            y={pad.t}
            width={iw}
            height={ih}
            fill="transparent"
            style={{ touchAction: "pan-y" }}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}

      {hp && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1 z-10 w-[168px] rounded-xl border border-black/[0.07] bg-white/95 p-3 shadow-[0_12px_32px_-8px_rgba(19,35,32,0.28)] backdrop-blur"
          style={{ left: tipLeft }}
        >
          <p className="text-[11px] font-semibold text-[#132320]">{hp.label}</p>
          <dl className="mt-1.5 space-y-1 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-[#132320]/55">
                <span className="h-2 w-2 rounded-full bg-[#132320]/40" />
                Scan
              </dt>
              <dd className="font-semibold tabular-nums text-[#132320]">{hp.scans}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-[#132320]/55">
                <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
                Klik review
              </dt>
              <dd className="font-semibold tabular-nums text-[#132320]">{hp.clicks}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-black/[0.06] pt-1">
              <dt className="text-[#132320]/55">Konversi</dt>
              <dd className="font-semibold tabular-nums text-[#132320]">
                {hp.scans > 0 ? `${Math.min(100, Math.round((hp.clicks / hp.scans) * 100))}%` : "-"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Corong: scan -> review / pesan                                      */
/* ------------------------------------------------------------------ */

export function Funnel({ result }: { result: AnalyticsResult }) {
  const grown = useMountedFlag();
  const { review, message, idle, total } = result.breakdown;

  if (total === 0) return null;

  const rows = [
    { label: "Scan kartu", n: total, color: "rgba(19,35,32,0.85)", hint: "100%" },
    {
      label: "Membuka Google Review",
      n: review,
      color: "var(--brand)",
      hint: `${Math.round((review / total) * 100)}%`,
    },
    {
      label: "Mengirim pesan ke owner / CS",
      n: message,
      color: "#C4636B",
      hint: `${Math.round((message / total) * 100)}%`,
    },
  ];

  return (
    <div>
      <ul className="space-y-4">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-[13px] text-[#132320]/70">{r.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-bold tabular-nums text-[#132320]">
                  {r.n.toLocaleString("id-ID")}
                </span>
                <span className="w-9 text-right text-[11px] tabular-nums text-[#132320]/45">
                  {r.hint}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-black/[0.05]">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{
                  width: grown ? `${Math.max(r.n > 0 ? 2 : 0, (r.n / total) * 100)}%` : "0%",
                  backgroundColor: r.color,
                  transitionDelay: `${i * 90}ms`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl bg-[#F6F8F7] px-3.5 py-2.5 text-xs leading-relaxed text-[#132320]/55">
        <span className="font-semibold text-[#132320]/75">
          {idle.toLocaleString("id-ID")} scan
        </span>{" "}
        hanya melihat halaman tanpa mengambil tindakan.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peta panas hari x jam                                               */
/* ------------------------------------------------------------------ */

export function Heatmap({ result }: { result: AnalyticsResult }) {
  const { heat, maxHeat, topSlots } = result;
  const [active, setActive] = useState<{ w: number; h: number } | null>(null);

  const activeLabel = active
    ? `${DAY_NAMES[active.w]}, ${formatHourRange(active.h)} - ${heat[active.w][active.h]} scan`
    : null;

  return (
    <div>
      {topSlots.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {topSlots.map((s, i) => (
            <span
              key={`${s.weekday}-${s.hour}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-2.5 py-1 text-[11px] font-medium text-[#132320]/75 shadow-sm"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ backgroundColor: "var(--brand)", opacity: 1 - i * 0.22 }}
              >
                {i + 1}
              </span>
              {DAY_NAMES[s.weekday]} {formatHourRange(s.hour).split("-")[0]}
              <span className="tabular-nums text-[#132320]/40">{s.n} scan</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0" />
        <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
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

      <div className="mt-1.5 space-y-[3px]" onPointerLeave={() => setActive(null)}>
        {heat.map((row, w) => (
          <div key={w} className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-[10px] font-medium text-[#132320]/45">
              {DAY_SHORT[w]}
            </span>
            <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
              {row.map((v, h) => {
                const isActive = active?.w === w && active?.h === h;
                return (
                  <button
                    key={h}
                    type="button"
                    aria-label={`${DAY_NAMES[w]} ${formatHourRange(h)}: ${v} scan`}
                    onPointerEnter={() => setActive({ w, h })}
                    onClick={() => setActive({ w, h })}
                    className={`aspect-square rounded-[4px] transition-transform duration-150 hover:scale-125 focus:outline-none ${
                      v === 0 ? "bg-black/[0.045]" : "bg-[var(--brand)]"
                    } ${isActive ? "z-10 scale-125 ring-2 ring-[#132320]/70" : ""}`}
                    style={v === 0 ? undefined : { opacity: 0.18 + 0.82 * (v / maxHeat) }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex min-h-[20px] items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-[#132320]/70" aria-live="polite">
          {activeLabel ?? "Arahkan atau ketuk kotak untuk melihat detail"}
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-[#132320]/40">
          Sedikit
          {[0.18, 0.4, 0.65, 1].map((o) => (
            <span
              key={o}
              className="h-2.5 w-2.5 rounded-[3px] bg-[var(--brand)]"
              style={{ opacity: o }}
            />
          ))}
          Banyak
        </div>
      </div>
    </div>
  );
}
