// lib/analytics.ts
//
// Perhitungan murni (tanpa React / tanpa database) untuk panel Analytics
// owner. Dipisah supaya gampang dites dan tidak bercampur dengan UI.
//
// Semua hari/jam dihitung dalam WIB (UTC+7, tanpa DST) secara manual -
// bukan Intl - supaya hasilnya identik di server, browser, dan Cloudflare
// Workers.

export type Period = 7 | 30 | 90;

/** [hariWIB, jam, jumlah] - hasil fungsi SQL owner_analytics(). */
export type ScanBucket = [number, number, number];
/** [hariWIB, jumlah] */
export type ClickBucket = [number, number];

// Retensi data (lihat app/api/cron/cleanup/route.ts): scan & klik review
// disimpan 90 hari, keluhan 30 hari. Pembanding "periode sebelumnya"
// hanya valid kalau 2x periode masih di dalam retensi.
export const SCAN_RETENTION_DAYS = 90;
export const COMPLAINT_RETENTION_DAYS = 30;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * HOUR_MS;

export const DAY_NAMES = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
] as const;

export const DAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;

/** Indeks hari WIB (hari ke-N sejak 1 Jan 1970 WIB). */
export function wibDayIndex(ts: number): number {
  return Math.floor((ts + WIB_OFFSET_MS) / DAY_MS);
}

/** Jam WIB 0-23. */
export function wibHour(ts: number): number {
  return Math.floor((((ts + WIB_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS);
}

/** Hari dalam minggu WIB: 0 = Senin ... 6 = Minggu. */
export function wibWeekday(dayIdx: number): number {
  // 1 Jan 1970 = Kamis. Senin=0 -> Kamis=3.
  return (((dayIdx + 3) % 7) + 7) % 7;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
] as const;

/** "29 Sep" dari indeks hari WIB. */
export function formatDayIndex(dayIdx: number): string {
  const d = new Date(dayIdx * DAY_MS); // sudah "WIB-shifted" -> baca pakai getUTC*
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatHourRange(h: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}.00-${pad((h + 1) % 24)}.00`;
}

function sumRange<T>(
  rows: T[],
  day: (r: T) => number,
  n: (r: T) => number,
  from: number,
  to: number
): number {
  let total = 0;
  for (const r of rows) {
    const d = day(r);
    if (d >= from && d <= to) total += n(r);
  }
  return total;
}

export type Delta = {
  /** persen perubahan, dibulatkan. null = tidak bisa dibandingkan. */
  pct: number | null;
};

function computeDelta(
  current: number,
  previous: number,
  comparable: boolean
): Delta {
  if (!comparable || previous <= 0) return { pct: null };
  return { pct: Math.round(((current - previous) / previous) * 100) };
}

export type DailyPoint = {
  dayIdx: number;
  label: string;
  scans: number;
  clicks: number;
  messages: number;
};

export type Slot = { weekday: number; hour: number; n: number };

export type AnalyticsResult = {
  period: Period;
  scans: number;
  clicks: number;
  messages: number;
  pending: number;
  resolved: number;
  /** klik review / scan, 0-100 (dibatasi 100). */
  conversion: number;
  scansDelta: Delta;
  clicksDelta: Delta;
  messagesDelta: Delta;
  conversionDeltaPts: number | null; // selisih poin persentase
  daily: DailyPoint[];
  maxDaily: number;
  /** heatmap[weekday 0..6][hour 0..23] = jumlah scan. */
  heat: number[][];
  maxHeat: number;
  peakWeekday: number | null;
  peakHour: number | null;
  /** 3 sel hari x jam tersibuk (untuk sorotan di peta panas). */
  topSlots: Slot[];
  /** rata-rata scan per hari sejak aktivitas pertama di periode ini. */
  avgPerDay: number;
  /** cukup data untuk menyimpulkan pola jam/hari? */
  hasPattern: boolean;
  /** pecahan setelah scan */
  breakdown: { review: number; message: number; idle: number; total: number };
  busiestDay: DailyPoint | null;
};

export const MIN_SCANS_FOR_PATTERN = 10;

export function computeAnalytics(input: {
  now: number;
  period: Period;
  scanBuckets: ScanBucket[];
  clickBuckets: ClickBucket[];
  /** Kejadian live (Realtime) setelah halaman dimuat - masih ISO. */
  liveScanTimes: string[];
  liveClickTimes: string[];
  complaints: { created_at: string; status: string }[];
}): AnalyticsResult {
  const { now, period } = input;

  // Gabungkan agregat dari database + kejadian live jadi satu bentuk.
  const scanCells: ScanBucket[] = [...input.scanBuckets];
  for (const iso of input.liveScanTimes) {
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) scanCells.push([wibDayIndex(t), wibHour(t), 1]);
  }
  const clickCells: ClickBucket[] = [...input.clickBuckets];
  for (const iso of input.liveClickTimes) {
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) clickCells.push([wibDayIndex(t), 1]);
  }

  const today = wibDayIndex(now);
  const from = today - (period - 1);
  const prevTo = from - 1;
  const prevFrom = prevTo - (period - 1);

  const scanDay = (r: ScanBucket) => r[0];
  const scanN = (r: ScanBucket) => r[2];
  const clickDay = (r: ClickBucket) => r[0];
  const clickN = (r: ClickBucket) => r[1];

  const scans = sumRange(scanCells, scanDay, scanN, from, today);
  const clicks = sumRange(clickCells, clickDay, clickN, from, today);

  // Keluhan: data mentah (punya status), dihitung dalam periode. Jumlahnya
  // kecil (disimpan 30 hari) dan memang sudah dimuat untuk Rekap Keluhan.
  let messages = 0;
  let pending = 0;
  let resolved = 0;
  let prevMessages = 0;
  const messagesPerDay = new Map<number, number>();
  for (const c of input.complaints) {
    const t = new Date(c.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const d = wibDayIndex(t);
    if (d >= from && d <= today) {
      messagesPerDay.set(d, (messagesPerDay.get(d) ?? 0) + 1);
      messages++;
      if (c.status === "Resolved") resolved++;
      else pending++;
    } else if (d >= prevFrom && d <= prevTo) {
      prevMessages++;
    }
  }

  const scansComparable = period * 2 <= SCAN_RETENTION_DAYS;
  const messagesComparable = period * 2 <= COMPLAINT_RETENTION_DAYS;

  const prevScans = sumRange(scanCells, scanDay, scanN, prevFrom, prevTo);
  const prevClicks = sumRange(clickCells, clickDay, clickN, prevFrom, prevTo);

  const conv = (c: number, s: number) =>
    s > 0 ? Math.min(100, Math.round((c / s) * 100)) : 0;
  const conversion = conv(clicks, scans);
  const prevConversion = conv(prevClicks, prevScans);

  // Harian (untuk grafik)
  const dailyMap = new Map<number, { scans: number; clicks: number }>();
  for (let d = from; d <= today; d++) dailyMap.set(d, { scans: 0, clicks: 0 });
  for (const [d, , n] of scanCells) {
    const cell = dailyMap.get(d);
    if (cell) cell.scans += n;
  }
  for (const [d, n] of clickCells) {
    const cell = dailyMap.get(d);
    if (cell) cell.clicks += n;
  }
  const daily: DailyPoint[] = [];
  let maxDaily = 0;
  let busiestDay: DailyPoint | null = null;
  for (let d = from; d <= today; d++) {
    const cell = dailyMap.get(d)!;
    const point: DailyPoint = {
      dayIdx: d,
      label: formatDayIndex(d),
      scans: cell.scans,
      clicks: cell.clicks,
      messages: messagesPerDay.get(d) ?? 0,
    };
    daily.push(point);
    maxDaily = Math.max(maxDaily, cell.scans, cell.clicks);
    if (cell.scans > 0 && (!busiestDay || cell.scans > busiestDay.scans)) {
      busiestDay = point;
    }
  }

  // Heatmap hari x jam (hanya scan dalam periode)
  const heat: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(24).fill(0)
  );
  for (const [d, h, n] of scanCells) {
    if (d < from || d > today || h < 0 || h > 23) continue;
    heat[wibWeekday(d)][h] += n;
  }
  let maxHeat = 0;
  const dayTotals = new Array<number>(7).fill(0);
  const hourTotals = new Array<number>(24).fill(0);
  for (let w = 0; w < 7; w++) {
    for (let h = 0; h < 24; h++) {
      const v = heat[w][h];
      maxHeat = Math.max(maxHeat, v);
      dayTotals[w] += v;
      hourTotals[h] += v;
    }
  }
  const hasPattern = scans >= MIN_SCANS_FOR_PATTERN;
  const argmax = (arr: number[]) =>
    arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);
  const peakWeekday = hasPattern ? argmax(dayTotals) : null;
  const peakHour = hasPattern ? argmax(hourTotals) : null;

  const slots: Slot[] = [];
  for (let w = 0; w < 7; w++) {
    for (let h = 0; h < 24; h++) {
      if (heat[w][h] > 0) slots.push({ weekday: w, hour: h, n: heat[w][h] });
    }
  }
  slots.sort((a, b) => b.n - a.n || a.weekday - b.weekday || a.hour - b.hour);
  const topSlots = hasPattern ? slots.slice(0, 3) : [];

  const firstActive = daily.find((p) => p.scans > 0);
  const activeDays = firstActive ? today - firstActive.dayIdx + 1 : 0;
  const avgPerDay =
    activeDays > 0 ? Math.round((scans / activeDays) * 10) / 10 : 0;

  // Pecahan setelah scan. Klik bisa berulang per orang & bisa lebih besar
  // dari scan -> penyebut pakai yang terbesar supaya tidak lewat 100%.
  const acted = clicks + messages;
  const total = Math.max(scans, acted);
  const idle = Math.max(0, scans - acted);

  return {
    period,
    scans,
    clicks,
    messages,
    pending,
    resolved,
    conversion,
    scansDelta: computeDelta(scans, prevScans, scansComparable),
    clicksDelta: computeDelta(clicks, prevClicks, scansComparable),
    messagesDelta: computeDelta(messages, prevMessages, messagesComparable),
    conversionDeltaPts:
      scansComparable && prevScans > 0 ? conversion - prevConversion : null,
    daily,
    maxDaily,
    heat,
    maxHeat,
    peakWeekday,
    peakHour,
    topSlots,
    avgPerDay,
    hasPattern,
    breakdown: { review: clicks, message: messages, idle, total },
    busiestDay,
  };
}

export type Insight = {
  tone: "good" | "warn" | "info";
  kind: "empty" | "trend" | "conversion" | "peak" | "complaint";
  text: string;
};

export function buildInsights(r: AnalyticsResult): Insight[] {
  const out: Insight[] = [];

  if (r.scans === 0) {
    return [
      {
        tone: "info",
        kind: "empty",
        text: "Belum ada scan pada periode ini. Pastikan kartu QR sudah terpasang di tempat yang mudah dilihat pelanggan.",
      },
    ];
  }

  if (r.scansDelta.pct !== null) {
    const p = r.scansDelta.pct;
    if (Math.abs(p) < 5) {
      out.push({
        tone: "info",
        kind: "trend",
        text: `Jumlah scan stabil dibanding ${r.period} hari sebelumnya.`,
      });
    } else if (p > 0) {
      out.push({
        tone: "good",
        kind: "trend",
        text: `Scan naik ${p}% dibanding ${r.period} hari sebelumnya.`,
      });
    } else {
      out.push({
        tone: "warn",
        kind: "trend",
        text: `Scan turun ${Math.abs(p)}% dibanding ${r.period} hari sebelumnya. Cek apakah kartu QR masih terlihat jelas di lokasi.`,
      });
    }
  }

  out.push({
    tone: r.conversion >= 40 ? "good" : "info",
    kind: "conversion",
    text: `${r.clicks} dari ${r.scans} scan lanjut membuka Google Review (${r.conversion}%).${
      r.conversion < 40 && r.scans >= 20
        ? " Menawarkan langsung ke pelanggan saat membayar biasanya menaikkan angka ini."
        : ""
    }`,
  });

  if (r.hasPattern && r.peakWeekday !== null && r.peakHour !== null) {
    out.push({
      tone: "info",
      kind: "peak",
      text: `Pelanggan paling banyak scan hari ${DAY_NAMES[r.peakWeekday]}, sekitar jam ${formatHourRange(r.peakHour)}. Waktu terbaik untuk mengingatkan tim menawarkan review.`,
    });
  }

  if (r.pending > 0) {
    out.push({
      tone: "warn",
      kind: "complaint",
      text: `${r.pending} pesan pelanggan belum ditandai selesai. Buka Rekap Keluhan untuk menindaklanjuti.`,
    });
  } else if (r.messages > 0) {
    out.push({
      tone: "good",
      kind: "complaint",
      text: "Semua pesan pelanggan pada periode ini sudah ditandai selesai.",
    });
  }

  return out;
}

export function buildShareText(
  storeName: string,
  r: AnalyticsResult
): string {
  const lines = [
    `Laporan ${storeName} - ${r.period} hari terakhir`,
    `- Total scan: ${r.scans}`,
    `- Klik review Google: ${r.clicks} (${r.conversion}% dari scan)`,
    `- Pesan ke owner/CS: ${r.messages}`,
  ];
  if (r.hasPattern && r.peakWeekday !== null && r.peakHour !== null) {
    lines.push(
      `- Paling ramai: ${DAY_NAMES[r.peakWeekday]}, jam ${formatHourRange(r.peakHour)}`
    );
  }
  return lines.join("\n");
}
