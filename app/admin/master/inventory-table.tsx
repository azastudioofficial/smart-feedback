"use client";
// app/admin/master/inventory-table.tsx

import { useState, type ReactNode } from "react";
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
import {
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  toggleSuspend,
  overrideProduct,
  resetAndUnbind,
  deleteProduct,
  getInventoryPage,
} from "./actions";
import { QrPrintDialog } from "@/components/qr-print-dialog";

type Product = {
  id: string;
  short_code: string;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  is_active: boolean;
  is_suspended: boolean;
  pending_review?: boolean;
  reseller_name?: string | null;
  created_at: string;
};

const MONO = { fontFamily: "var(--font-mono-ticket)" };
const HEADING = { fontFamily: "var(--font-admin-heading)" };
const PAGE_SIZE = 25;

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
  return (
    <Badge variant="outline" className="border-[#B45309]/40 text-[#B45309]">
      Stok Siap
    </Badge>
  );
}

export function InventoryTable({
  products,
  scanCounts,
  totalCount,
  showResellerColumn = false,
  allowDelete = true,
}: {
  products: Product[];
  scanCounts: Record<string, number>;
  totalCount?: number;
  showResellerColumn?: boolean;
  allowDelete?: boolean;
}) {
  const [items, setItems] = useState(products);
  const [editing, setEditing] = useState<Product | null>(null);
  const [printingCode, setPrintingCode] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(totalCount ?? products.length);
  const [loadingPage, setLoadingPage] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function goToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setLoadingPage(true);
    const result = await getInventoryPage(page, PAGE_SIZE);
    setLoadingPage(false);

    if (!result.success || !result.data) {
      alert(result.error ?? "Gagal memuat halaman.");
      return;
    }
    setItems(result.data);
    setTotal(result.totalCount ?? total);
    setCurrentPage(page);
  }

  function handlePrintQr(p: Product) {
    setPrintingCode(p.short_code);
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
        p.business_name ?? p.short_code
      }"? Akrilik ini akan bisa dijual ke klien baru.`
    );
    if (!confirmed) return;

    setBusyId(p.id);
    const result = await resetAndUnbind(p.id);
    setBusyId(null);

    if (!result.success) {
      alert(result.error ?? "Gagal reset.");
      return;
    }

    setItems((prev) =>
      prev.map((it) =>
        it.id === p.id
          ? {
              ...it,
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
      `HAPUS PERMANEN "${p.short_code}"${
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
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#132320]/15 transition hover:bg-black/[0.04] disabled:opacity-50"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(p)}>
            Edit Data
          </DropdownMenuItem>
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

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <h2 className="text-lg font-extrabold text-[#132320]" style={HEADING}>
          Semua Kartu ({total})
        </h2>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm text-[#132320]/60">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1 || loadingPage}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-black/[0.1] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages || loadingPage}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-black/[0.1] disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ===== Tampilan TABEL - lg ke atas (tablet landscape & desktop).
          7-8 kolom sekaligus itu nyaman di layar lebar, tapi kepaksa
          scroll ke samping kalau dipaksa muat di HP - makanya di layar
          sempit diganti tampilan kartu di bawah, bukan tabel yang sama
          dipersempit. ===== */}
      <div className="hidden overflow-x-auto lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID Kartu</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Nama Toko</TableHead>
              {showResellerColumn && <TableHead>Reseller</TableHead>}
              <TableHead>Link Review</TableHead>
              <TableHead>Scan</TableHead>
              <TableHead>URL Kartu</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-semibold" style={MONO}>
                  {p.short_code}
                </TableCell>
                <TableCell>
                  <StatusBadge p={p} />
                </TableCell>
                <TableCell>{p.business_name || "-"}</TableCell>
                {showResellerColumn && (
                  <TableCell className="text-xs text-[#132320]/60">
                    {p.reseller_name || "-"}
                  </TableCell>
                )}
                <TableCell>
                  {p.google_review_url ? (
                    <a
                      href={p.google_review_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#0E7C86] underline underline-offset-2"
                    >
                      Buka Link
                    </a>
                  ) : (
                    <span className="text-[#132320]/40">-</span>
                  )}
                </TableCell>
                <TableCell style={MONO}>{scanCounts[p.id] ?? 0}</TableCell>
                <TableCell className="max-w-[180px] truncate text-xs text-[#132320]/50">
                  /r/{p.short_code}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={busyId === p.id}
                      onClick={() => handlePrintQr(p)}
                      className="h-11 border-[#132320]/15"
                    >
                      Cetak QR
                    </Button>
                    {renderRowMenu(p)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
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
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#132320]">
                  {p.business_name || "(Tanpa nama)"}
                </p>
                <p className="text-xs text-[#132320]/40" style={MONO}>
                  {p.short_code}
                </p>
              </div>
              <StatusBadge p={p} />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#132320]/55">
              <span>
                Scan:{" "}
                <strong className="text-[#132320]">
                  {scanCounts[p.id] ?? 0}
                </strong>
              </span>
              {showResellerColumn && (
                <span>Reseller: {p.reseller_name || "-"}</span>
              )}
            </div>

            {p.google_review_url && (
              <a
                href={p.google_review_url}
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

      <QrPrintDialog
        shortCode={printingCode}
        open={!!printingCode}
        onOpenChange={(o) => !o && setPrintingCode(null)}
      />

      {/* Modal edit override */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Data Toko — {editing?.short_code}</DialogTitle>
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
