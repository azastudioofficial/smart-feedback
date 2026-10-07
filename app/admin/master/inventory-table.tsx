"use client";
// app/admin/master/inventory-table.tsx

import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Crown,
  Search,
  X,
  CheckCircle2,
} from "lucide-react";
import {
  toggleSuspend,
  overrideProduct,
  resetAndUnbind,
  deleteProduct,
  getInventoryPage,
  setPlan,
  setPlanByCodes,
  setStockActivation,
  setStockActivationByFilter,
  listResellers,
  type Plan,
  type InventoryFilters,
} from "./actions";
import { QrPrintDialog } from "@/components/qr-print-dialog";
import { formatCardNumber } from "@/lib/card-number";
import { safeHttpUrl } from "@/lib/safe-url";

type Product = {
  id: string;
  short_code: string;
  card_seq?: number | null;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  is_active: boolean;
  is_suspended: boolean;
  pending_review?: boolean;
  stock_activated?: boolean;
  plan?: Plan;
  reseller_name?: string | null;
  created_at: string;
  last_scanned_at?: string | null;
};

const MONO = { fontFamily: "var(--font-mono-ticket)" };
const HEADING = { fontFamily: "var(--font-admin-heading)" };

// Filter status sebagai "chip" (dulu <select>) - semua pilihan kelihatan
// sekaligus dan bisa diganti dengan satu klik.
const STATUS_CHIPS: {
  value: NonNullable<InventoryFilters["status"]>;
  label: string;
}[] = [
  { value: "", label: "Semua" },
  { value: "aktif", label: "Aktif" },
  { value: "menunggu", label: "Menunggu" },
  { value: "stok_siap", label: "Stok Siap" },
  { value: "stok_aktif", label: "Stok Aktif" },
  { value: "suspended", label: "Suspended" },
];

const TH =
  "h-10 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#132320]/50";

// Label kartu di layar = nomor internal (AZA20001); kode acak QR (short_code)
// hanya muncul kecil di bawahnya dan jadi cadangan kalau nomor belum ada.
const cardLabel = (p: { card_seq?: number | null; short_code: string }) =>
  formatCardNumber(p.card_seq) ?? p.short_code;
const PAGE_SIZE = 25;


// null di render pertama (server & klien sama-sama render tanpa waktu
// relatif -> tidak ada hydration mismatch), baru terisi setelah mount
// dan disegarkan tiap menit.
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function relativeTime(iso: string, now: number) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} bulan lalu`;
  return `${Math.floor(day / 365)} tahun lalu`;
}

function formatAbsolute(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function LastScan({
  iso,
  compact = false,
}: {
  iso?: string | null;
  compact?: boolean;
}) {
  const now = useNow();
  if (!iso) {
    return <span className="text-[#132320]/40">Belum pernah</span>;
  }
  const rel = now != null ? relativeTime(iso, now) : null;
  if (compact) {
    return (
      <span title={formatAbsolute(iso)} suppressHydrationWarning>
        {rel ?? formatAbsolute(iso)}
      </span>
    );
  }
  return (
    <div title={formatAbsolute(iso)} suppressHydrationWarning>
      <p className="text-sm text-[#132320]">{rel ?? "\u00A0"}</p>
      <p className="text-[11px] text-[#132320]/40">{formatAbsolute(iso)}</p>
    </div>
  );
}

// Link ke halaman kartu seperti yang dilihat pelanggan. ?preview=1 =
// dibuka tanpa dihitung sebagai scan (lihat app/r/[uid]/page.tsx).
function CardUrlLink({ code, className }: { code: string; className?: string }) {
  return (
    <a
      href={`/r/${code}?preview=1`}
      target="_blank"
      rel="noreferrer"
      title="Buka halaman kartu (tidak dihitung sebagai scan)"
      className={`inline-flex items-center gap-1 text-[#0E7C86] underline-offset-2 hover:underline ${className ?? ""}`}
    >
      /r/{code}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

// Dipakai bersama oleh tampilan tabel (desktop) DAN kartu (mobile) -
// biar logika status kartu nggak bisa "kesimpangan" antara 2 tampilan.
function StatusBadge({ p }: { p: Product }) {
  if (p.is_suspended) {
    return (
      <Badge className="bg-[#B5585E] hover:bg-[#9c4a50]">Suspended</Badge>
    );
  }
  if (p.pending_review) {
    return (
      <Badge className="bg-[#B45309] hover:bg-[#9a4507]">
        Menunggu Persetujuan
      </Badge>
    );
  }
  if (p.is_active) {
    return <Badge className="bg-[#0E7C86] hover:bg-[#0B5F67]">Aktif</Badge>;
  }
  // Kartu kosong yang sudah ditandai "stok aktif": pembeli yang
  // mengaktivasinya langsung aktif, tanpa menunggu persetujuan.
  if (p.stock_activated) {
    return (
      <Badge
        variant="outline"
        className="border-[#0E7C86]/50 bg-[#E4F1F1] text-[#0E7C86]"
      >
        Stok Aktif
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-[#B45309]/40 text-[#B45309]">
      Stok Siap
    </Badge>
  );
}

// Badge paket layanan. Kartu tanpa nilai plan dianggap Pro (sama dengan
// migrasi SQL: kartu lama otomatis Pro).
function PlanBadge({ p }: { p: Product }) {
  if ((p.plan ?? "pro") === "pro") {
    return (
      <Badge className="gap-1 bg-[#132320] hover:bg-[#132320]">
        <Crown className="h-3 w-3" />
        Pro
      </Badge>
    );
  }
  return (
    <Badge className="bg-[#5B7B78] hover:bg-[#4D6663]">Basic</Badge>
  );
}

export function InventoryTable({
  products,
  scanCounts: initialScanCounts,
  totalCount,
  showResellerColumn = false,
  allowDelete = true,
  allowPlanChange = false,
  allowStockActivation = true,
}: {
  products: Product[];
  scanCounts: Record<string, number>;
  totalCount?: number;
  showResellerColumn?: boolean;
  allowDelete?: boolean;
  allowPlanChange?: boolean;
  // Tombol "Aktifkan Stok" (aktivasi tanpa persetujuan) - admin & reseller.
  allowStockActivation?: boolean;
}) {
  const [items, setItems] = useState(products);
  // Salinan lokal supaya angka Scan bisa langsung jadi 0 setelah Reset.
  const [scanCounts, setScanCounts] = useState(initialScanCounts);
  const [editing, setEditing] = useState<Product | null>(null);
  const [printingCode, setPrintingCode] = useState<string | null>(null);
  const [printingLabel, setPrintingLabel] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(totalCount ?? products.length);
  const [loadingPage, setLoadingPage] = useState(false);

  // --- Filter (Reseller / Status / cari nama-toko atau ID kartu) ---
  const [searchInput, setSearchInput] = useState(""); // apa yg diketik
  const [search, setSearch] = useState(""); // versi ter-debounce, dipakai buat query
  const [resellerFilter, setResellerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<InventoryFilters["status"]>("");
  const [resellerOptions, setResellerOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const filtersActive = Boolean(search || resellerFilter || statusFilter);

  // Reseller cuma perlu difilter kalau kolom Reseller memang ditampilkan
  // (halaman reseller sendiri cuma lihat kartunya sendiri lewat RLS).
  useEffect(() => {
    if (!showResellerColumn) return;
    listResellers().then((res) => {
      if (res.success && res.data) setResellerOptions(res.data);
    });
  }, [showResellerColumn]);

  // Debounce 400ms - biar nggak nembak query tiap 1 huruf diketik.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadWithFilters = useCallback(
    async (page: number) => {
      setLoadingPage(true);
      const result = await getInventoryPage(page, PAGE_SIZE, {
        search,
        resellerId: resellerFilter,
        status: statusFilter,
      });
      setLoadingPage(false);
      if (!result.success || !result.data) {
        alert(result.error ?? "Gagal memuat data.");
        return;
      }
      setItems(result.data);
      setTotal(result.totalCount ?? 0);
      setCurrentPage(page);
    },
    [search, resellerFilter, statusFilter]
  );

  // Filter berubah -> selalu balik ke halaman 1, biar nggak nyasar di
  // halaman 2 dari filter sebelumnya yang hasilnya cuma dikit.
  const isFirstRun = useState({ current: true })[0];
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    loadWithFilters(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, resellerFilter, statusFilter]);

  // --- Paket Basic/Pro (khusus Super Admin) ---
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [codesText, setCodesText] = useState("");
  const [codesMessage, setCodesMessage] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function goToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    await loadWithFilters(page);
  }

  function clearFilters() {
    setSearchInput("");
    setResellerFilter("");
    setStatusFilter("");
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected =
    items.length > 0 && items.every((it) => selected.has(it.id));

  function toggleSelectAllOnPage() {
    setSelected(allOnPageSelected ? new Set() : new Set(items.map((it) => it.id)));
  }

  async function applyPlan(ids: string[], plan: Plan) {
    setBulkBusy(true);
    const result = await setPlan(ids, plan);
    setBulkBusy(false);

    if (!result.success) {
      alert(result.error ?? "Gagal mengubah paket.");
      return;
    }
    const idSet = new Set(ids);
    setItems((prev) =>
      prev.map((it) => (idSet.has(it.id) ? { ...it, plan } : it))
    );
    setSelected(new Set());
  }

  async function handleRowPlan(p: Product) {
    const next: Plan = (p.plan ?? "pro") === "pro" ? "basic" : "pro";
    if (next === "basic") {
      const ok = confirm(
        `Turunkan "${p.business_name ?? cardLabel(p)}" ke Basic? Pelanggan yang scan akan langsung ke Google Review dan dasbor owner terkunci. Data lama tidak dihapus.`
      );
      if (!ok) return;
    }
    setBusyId(p.id);
    await applyPlan([p.id], next);
    setBusyId(null);
  }

  async function handleBulkPlan(plan: Plan) {
    const ids = Array.from(selected);
    if (plan === "basic") {
      const ok = confirm(
        `Turunkan ${ids.length} kartu ke Basic? Dasbor owner-nya akan terkunci.`
      );
      if (!ok) return;
    }
    await applyPlan(ids, plan);
  }

  async function handlePlanByCodes(plan: Plan) {
    setCodesMessage(null);
    setBulkBusy(true);
    const result = await setPlanByCodes(codesText, plan);
    setBulkBusy(false);

    if (!result.success) {
      setCodesMessage(result.error ?? "Gagal.");
      return;
    }
    const label = plan === "pro" ? "Pro" : "Basic";
    const missing = result.notFound?.length
      ? ` Kode tidak ditemukan: ${result.notFound.join(", ")}.`
      : "";
    setCodesMessage(`${result.updated ?? 0} kartu diubah ke ${label}.${missing}`);

    // Muat ulang halaman aktif supaya badge langsung sesuai database.
    const refreshed = await getInventoryPage(currentPage, PAGE_SIZE);
    if (refreshed.success && refreshed.data) {
      setItems(refreshed.data);
    }
    if (!result.notFound?.length) setCodesText("");
  }

  // Checkbox pilih-kartu dipakai bersama oleh aksi paket (admin) dan
  // aksi stok aktif (admin & reseller).
  const showSelect = allowPlanChange || allowStockActivation;

  async function applyStock(ids: string[], activate: boolean) {
    setBulkBusy(true);
    const result = await setStockActivation(ids, activate);
    setBulkBusy(false);

    if (!result.success) {
      alert(result.error ?? "Gagal mengubah status stok.");
      return;
    }
    if (result.skipped) {
      alert(
        `${result.updated ?? 0} kartu diproses. ${result.skipped} kartu dilewati karena ${
          activate
            ? "bukan kartu kosong (sudah aktif, menunggu persetujuan, atau ditangguhkan)"
            : "tidak sedang bertanda stok aktif"
        }.`
      );
    }
    setSelected(new Set());
    await loadWithFilters(1);
  }

  async function handleRowStock(p: Product) {
    const next = !p.stock_activated;
    setBusyId(p.id);
    const result = await setStockActivation([p.id], next);
    setBusyId(null);

    if (!result.success || !result.updated) {
      alert(
        result.error ?? "Kartu ini tidak bisa diubah (bukan kartu kosong)."
      );
      return;
    }
    setItems((prev) =>
      prev.map((it) => (it.id === p.id ? { ...it, stock_activated: next } : it))
    );
  }

  async function handleStockByFilter(activate: boolean) {
    const resellerName = resellerOptions.find(
      (r) => r.id === resellerFilter
    )?.name;
    const scope = [
      resellerName ? `reseller "${resellerName}"` : null,
      search ? `pencarian "${search}"` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const ok = confirm(
      activate
        ? `Aktifkan stok untuk ${total} kartu kosong${scope ? ` (${scope})` : ""}?\n\nPembeli yang mengaktivasi kartu ini akan LANGSUNG aktif tanpa menunggu persetujuan.`
        : `Batalkan stok aktif untuk ${total} kartu${scope ? ` (${scope})` : ""}?\n\nKartu kembali ke alur permohonan aktivasi.`
    );
    if (!ok) return;

    setBulkBusy(true);
    const result = await setStockActivationByFilter(
      { search, resellerId: resellerFilter },
      activate
    );
    setBulkBusy(false);

    if (!result.success) {
      alert(result.error ?? "Gagal mengubah status stok.");
      return;
    }
    alert(
      `${result.updated ?? 0} kartu ${
        activate ? "diaktifkan stoknya" : "dibatalkan stok aktifnya"
      }.`
    );
    await loadWithFilters(1);
  }

  function handlePrintQr(p: Product) {
    setPrintingCode(p.short_code);
    setPrintingLabel(cardLabel(p));
  }

  async function handleToggleSuspend(p: Product) {
    setBusyId(p.id);
    const result = await toggleSuspend(p.id, !p.is_suspended);
    setBusyId(null);

    if (!result.success) {
      alert(result.error ?? "Gagal.");
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === p.id ? { ...it, is_suspended: !p.is_suspended } : it
      )
    );
  }

  async function handleResetUnbind(p: Product) {
    const confirmed = confirm(
      `Kosongkan data toko "${
        p.business_name ?? cardLabel(p)
      }"? Akrilik ini akan bisa dijual ke klien baru. Riwayat scan kartu ini juga ikut direset ke 0.`
    );
    if (!confirmed) return;

    setBusyId(p.id);
    const result = await resetAndUnbind(p.id);
    setBusyId(null);

    if (!result.success) {
      alert(result.error ?? "Gagal reset.");
      return;
    }

    setScanCounts((prev) => ({ ...prev, [p.id]: 0 }));
    setItems((prev) =>
      prev.map((it) =>
        it.id === p.id
          ? {
              ...it,
              last_scanned_at: null,
              business_name: null,
              google_review_url: null,
              owner_whatsapp: null,
              is_active: false,
              is_suspended: false,
              pending_review: false,
            }
          : it
      )
    );
  }

  async function handleDelete(p: Product) {
    const confirmed = confirm(
      `HAPUS PERMANEN "${cardLabel(p)}"${
        p.business_name ? ` (${p.business_name})` : ""
      }?\n\nSemua riwayat scan & keluhan kartu ini akan ikut terhapus dan TIDAK BISA dikembalikan.`
    );
    if (!confirmed) return;

    setBusyId(p.id);
    const result = await deleteProduct(p.id, p.short_code);
    setBusyId(null);

    if (!result.success) {
      alert(result.error ?? "Gagal menghapus.");
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== p.id));
  }

  async function handleSaveOverride(data: {
    businessName: string;
    googleReviewUrl: string;
    ownerWhatsapp: string;
  }) {
    if (!editing) return;
    const result = await overrideProduct(editing.id, data);
    if (!result.success) {
      alert(result.error ?? "Gagal menyimpan.");
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === editing.id
          ? {
              ...it,
              business_name: data.businessName,
              google_review_url: data.googleReviewUrl,
              owner_whatsapp: data.ownerWhatsapp,
            }
          : it
      )
    );
    setEditing(null);
  }

  // Menu ⋮ dipakai identik di tabel (desktop) & kartu (mobile) - satu
  // fungsi ini yang merender isinya, dipanggil dari 2 tempat.
  function renderRowMenu(p: Product): ReactNode {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busyId === p.id}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#132320]/15 transition hover:bg-black/[0.04] disabled:opacity-50 lg:h-10 lg:w-10"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(p)}>
            Edit Data
          </DropdownMenuItem>
          {allowPlanChange && (
            <DropdownMenuItem onClick={() => handleRowPlan(p)}>
              {(p.plan ?? "pro") === "pro"
                ? "Turunkan ke Basic"
                : "Upgrade ke Pro"}
            </DropdownMenuItem>
          )}
          {allowStockActivation &&
            !p.is_active &&
            !p.pending_review &&
            !p.is_suspended && (
              <DropdownMenuItem onClick={() => handleRowStock(p)}>
                {p.stock_activated ? "Batalkan Stok Aktif" : "Aktifkan Stok"}
              </DropdownMenuItem>
            )}
          <DropdownMenuItem onClick={() => handleToggleSuspend(p)}>
            {p.is_suspended ? "Unsuspend" : "Suspend"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleResetUnbind(p)}>
            Reset / Unbind
          </DropdownMenuItem>
          {allowDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDelete(p)}
                className="text-[#B5585E] focus:text-[#B5585E]"
              >
                Hapus Permanen
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const rangeFrom = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(currentPage * PAGE_SIZE, total);

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {/* ===== Header ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-extrabold text-[#132320]" style={HEADING}>
            Semua Kartu
          </h2>
          <span className="rounded-full bg-[#EEF1F1] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#132320]/60">
            {total}
          </span>
        </div>
        {allowPlanChange && (
          <Button
            variant="outline"
            onClick={() => {
              setCodesMessage(null);
              setCodesOpen(true);
            }}
            className="h-10 gap-2 border-[#132320]/15"
          >
            <Crown className="h-4 w-4" />
            Ubah Paket via Kode
          </Button>
        )}
      </div>

      {/* ===== Filter: cari + reseller, lalu chip status ===== */}
      <div className="space-y-3 border-t border-black/[0.06] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#132320]/35" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama toko, nomor kartu (AZA20001), atau kode..."
              className="h-11 pl-9"
            />
          </div>

          {showResellerColumn && (
            <select
              value={resellerFilter}
              onChange={(e) => setResellerFilter(e.target.value)}
              aria-label="Filter reseller"
              className="h-11 min-w-[180px] rounded-md border border-black/[0.12] bg-white px-3 text-sm text-[#132320] focus:outline-none focus:ring-2 focus:ring-[#0E7C86]/40"
            >
              <option value="">Semua Reseller</option>
              {resellerOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}

          {filtersActive && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              className="h-11 gap-1 text-[#132320]/60"
            >
              <X className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter status"
            className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5"
          >
            {STATUS_CHIPS.map((c) => {
              const on = (statusFilter ?? "") === c.value;
              return (
                <button
                  key={c.value || "semua"}
                  type="button"
                  onClick={() => setStatusFilter(c.value)}
                  aria-pressed={on}
                  className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition ${
                    on
                      ? "border-[#132320] bg-[#132320] text-white"
                      : "border-black/[0.1] bg-white text-[#132320]/65 hover:border-[#0E7C86]/40 hover:text-[#0E7C86]"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {allowStockActivation &&
            total > 0 &&
            (statusFilter === "stok_siap" || statusFilter === "stok_aktif") && (
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => handleStockByFilter(statusFilter === "stok_siap")}
                className="h-9 gap-2 border-[#0E7C86]/40 text-[#0E7C86] sm:ml-auto"
              >
                <CheckCircle2 className="h-4 w-4" />
                {bulkBusy
                  ? "Memproses..."
                  : statusFilter === "stok_siap"
                    ? `Aktifkan stok semua (${total})`
                    : `Batalkan stok aktif semua (${total})`}
              </Button>
            )}
        </div>

        {filtersActive && (
          <p className="text-[13px] text-[#132320]/55">
            Menampilkan {total} kartu yang cocok dengan filter.
          </p>
        )}
      </div>

      {showSelect && selected.size > 0 && (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#0E7C86]/25 bg-[#E4F1F1] p-3">
          <span className="mr-auto text-sm font-semibold text-[#132320]">
            {selected.size} kartu dipilih
          </span>
          {allowStockActivation && (
            <>
              <Button
                disabled={bulkBusy}
                onClick={() => applyStock(Array.from(selected), true)}
                className="h-11 gap-2 bg-[#0E7C86] hover:bg-[#0B5F67]"
              >
                <CheckCircle2 className="h-4 w-4" />
                {bulkBusy ? "Memproses..." : "Aktifkan Stok"}
              </Button>
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => applyStock(Array.from(selected), false)}
                className="h-11 border-[#132320]/20 bg-white"
              >
                Batalkan Stok Aktif
              </Button>
            </>
          )}
          {allowPlanChange && (
            <>
              <Button
                disabled={bulkBusy}
                onClick={() => handleBulkPlan("pro")}
                className="h-11 gap-2 bg-[#0E7C86] hover:bg-[#0B5F67]"
              >
                <Crown className="h-4 w-4" />
                {bulkBusy ? "Memproses..." : "Upgrade ke Pro"}
              </Button>
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => handleBulkPlan("basic")}
                className="h-11 border-[#132320]/20 bg-white"
              >
                Turunkan ke Basic
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            disabled={bulkBusy}
            onClick={() => setSelected(new Set())}
            className="h-11"
          >
            Batal
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="border-t border-black/[0.06] px-5 py-14 text-center">
          <p className="text-sm font-semibold text-[#132320]">
            Tidak ada kartu yang cocok
          </p>
          <p className="mt-1 text-[13px] text-[#132320]/50">
            {filtersActive
              ? "Coba ubah kata kunci atau filternya."
              : "Belum ada kartu. Buat stok QR lebih dulu."}
          </p>
          {filtersActive && (
            <Button
              variant="outline"
              onClick={clearFilters}
              className="mt-4 h-10"
            >
              Reset filter
            </Button>
          )}
        </div>
      ) : (
        <div
          className={`border-t border-black/[0.06] transition-opacity ${
            loadingPage ? "opacity-60" : ""
          }`}
        >
          {/* ===== Tampilan TABEL - lg ke atas. Kolom dirapatkan jadi 5
              (+ Scan Terakhir): ID + link kartu jadi satu,
              reseller & link review ikut di bawah nama toko, paket ikut
              di kolom status. Scan terakhir tampil lengkap (waktu relatif
              + tanggal & jam).
              Di layar sempit dipakai tampilan kartu di bawah. ===== */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F6F8F7]/80 hover:bg-[#F6F8F7]/80">
                  {showSelect && (
                    <TableHead className="w-10 px-3">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua kartu di halaman ini"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        className="h-4 w-4 accent-[#0E7C86]"
                      />
                    </TableHead>
                  )}
                  <TableHead className={TH}>Kartu</TableHead>
                  <TableHead className={TH}>Toko</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={TH}>Scan</TableHead>
                  <TableHead className={TH}>Scan Terakhir</TableHead>
                  <TableHead className={`${TH} text-right`}>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => {
                  const reviewHref = safeHttpUrl(p.google_review_url);
                  const hasMeta =
                    (showResellerColumn && !!p.reseller_name) || !!reviewHref;
                  return (
                    <TableRow key={p.id}>
                      {showSelect && (
                        <TableCell className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Pilih kartu ${cardLabel(p)}`}
                            checked={selected.has(p.id)}
                            onChange={() => toggleSelected(p.id)}
                            className="h-4 w-4 accent-[#0E7C86]"
                          />
                        </TableCell>
                      )}
                      <TableCell className="px-3 py-3">
                        <p
                          className="font-semibold text-[#132320]"
                          style={MONO}
                        >
                          {cardLabel(p)}
                        </p>
                        <CardUrlLink
                          code={p.short_code}
                          className="mt-0.5 text-[11px]"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <p
                          className={`font-medium ${
                            p.business_name
                              ? "text-[#132320]"
                              : "text-[#132320]/35"
                          }`}
                        >
                          {p.business_name || "Belum diisi"}
                        </p>
                        {hasMeta && (
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[#132320]/50">
                            {showResellerColumn && p.reseller_name && (
                              <span>{p.reseller_name}</span>
                            )}
                            {reviewHref && (
                              <a
                                href={reviewHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#0E7C86] hover:underline"
                              >
                                Link review
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            )}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge p={p} />
                          <PlanBadge p={p} />
                        </div>
                      </TableCell>
                      <TableCell
                        className="px-3 py-3 font-semibold tabular-nums text-[#132320]"
                        style={MONO}
                      >
                        {scanCounts[p.id] ?? 0}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3">
                        <LastScan iso={p.last_scanned_at} />
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            disabled={busyId === p.id}
                            onClick={() => handlePrintQr(p)}
                            className="h-10 border-[#132320]/15"
                          >
                            Cetak QR
                          </Button>
                          {renderRowMenu(p)}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

      {/* ===== Tampilan KARTU - di bawah lg (HP & tablet portrait).
          Field yang ditampilkan sengaja dipilih yang paling penting
          buat dipindai cepat: nama+kode, status, scan, link review.
          Sisanya (edit data, suspend, reset, hapus) tetap ada di
          menu ⋮, sama persis kayak di tabel. ===== */}
      <div className="divide-y divide-black/[0.06] lg:hidden">
        {items.map((p) => (
          <div key={p.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              {showSelect && (
                <input
                  type="checkbox"
                  aria-label={`Pilih kartu ${cardLabel(p)}`}
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelected(p.id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[#0E7C86]"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[#132320]">
                  {p.business_name || "(Tanpa nama)"}
                </p>
                <p className="text-xs text-[#132320]/40" style={MONO}>
                  {cardLabel(p)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge p={p} />
                <PlanBadge p={p} />
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#132320]/55">
              <span>
                Scan:{" "}
                <strong className="text-[#132320]">
                  {scanCounts[p.id] ?? 0}
                </strong>
              </span>
              <span>
                Scan terakhir: <LastScan iso={p.last_scanned_at} compact />
                {p.last_scanned_at && (
                  <span suppressHydrationWarning>
                    {" "}
                    &middot; {formatAbsolute(p.last_scanned_at)}
                  </span>
                )}
              </span>
              {showResellerColumn && (
                <span>Reseller: {p.reseller_name || "-"}</span>
              )}
            </div>

            <CardUrlLink code={p.short_code} className="text-xs" />

            {safeHttpUrl(p.google_review_url) && (
              <a
                href={safeHttpUrl(p.google_review_url) as string}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#0E7C86] underline underline-offset-2"
              >
                Buka Link Review
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                disabled={busyId === p.id}
                onClick={() => handlePrintQr(p)}
                className="h-11 flex-1 border-[#132320]/15"
              >
                Cetak QR
              </Button>
              {renderRowMenu(p)}
            </div>
          </div>
        ))}
      </div>
        </div>
      )}

      {/* ===== Footer: rentang data + halaman ===== */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] px-5 py-3 text-[13px] text-[#132320]/55">
          <span>
            Menampilkan{" "}
            <strong className="font-semibold text-[#132320]">
              {rangeFrom}&ndash;{rangeTo}
            </strong>{" "}
            dari {total} kartu
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || loadingPage}
                aria-label="Halaman sebelumnya"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-black/[0.1] bg-white transition hover:bg-black/[0.03] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[56px] text-center tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || loadingPage}
                aria-label="Halaman berikutnya"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-black/[0.1] bg-white transition hover:bg-black/[0.03] disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <QrPrintDialog
        shortCode={printingCode}
        label={printingLabel}
        open={!!printingCode}
        onOpenChange={(o) => !o && setPrintingCode(null)}
      />

      {/* Modal: ubah paket lewat daftar kode */}
      <Dialog open={codesOpen} onOpenChange={setCodesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Paket via Kode Kartu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#132320]/60">
              Tempel kode kartu (boleh juga link penuh /r/KODE), dipisah
              spasi, koma, atau baris baru. Cocok untuk kartu yang tersebar
              di banyak halaman.
            </p>
            <Textarea
              value={codesText}
              onChange={(e) => setCodesText(e.target.value)}
              rows={6}
              placeholder={"AKR7K2P9\nAKR3M8QX\nAKR5T1VB"}
              className="text-base"
              style={MONO}
            />
            {codesMessage && (
              <p className="text-sm text-[#132320]">{codesMessage}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={bulkBusy || !codesText.trim()}
                onClick={() => handlePlanByCodes("pro")}
                className="h-11 flex-1 gap-2 bg-[#0E7C86] hover:bg-[#0B5F67]"
              >
                <Crown className="h-4 w-4" />
                {bulkBusy ? "Memproses..." : "Upgrade ke Pro"}
              </Button>
              <Button
                variant="outline"
                disabled={bulkBusy || !codesText.trim()}
                onClick={() => handlePlanByCodes("basic")}
                className="h-11 border-[#132320]/20"
              >
                Turunkan ke Basic
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal edit override */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Data Toko — {editing ? cardLabel(editing) : ""}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <OverrideForm product={editing} onSave={handleSaveOverride} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverrideForm({
  product,
  onSave,
}: {
  product: Product;
  onSave: (data: {
    businessName: string;
    googleReviewUrl: string;
    ownerWhatsapp: string;
  }) => void;
}) {
  const [businessName, setBusinessName] = useState(product.business_name ?? "");
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    product.google_review_url ?? ""
  );
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(
    product.owner_whatsapp ?? ""
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Nama Toko</Label>
        <Input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="h-11 text-base"
        />
      </div>
      <div className="space-y-1">
        <Label>Link Google Review</Label>
        <Input
          value={googleReviewUrl}
          onChange={(e) => setGoogleReviewUrl(e.target.value)}
          className="h-11 text-base"
        />
      </div>
      <div className="space-y-1">
        <Label>Nomor WhatsApp Owner</Label>
        <Input
          value={ownerWhatsapp}
          onChange={(e) => setOwnerWhatsapp(e.target.value)}
          className="h-11 text-base"
        />
      </div>
      <Button
        onClick={() =>
          onSave({ businessName, googleReviewUrl, ownerWhatsapp })
        }
        className="h-11 w-full bg-[#0E7C86] text-base hover:bg-[#0B5F67]"
      >
        Simpan
      </Button>
    </div>
  );
}
