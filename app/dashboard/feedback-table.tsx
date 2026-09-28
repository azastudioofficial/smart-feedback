"use client";
// app/dashboard/feedback-table.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Download,
  FolderDown,
  Loader2,
  Clock,
  Trash2,
} from "lucide-react";
import { saveAs } from "file-saver";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cloudinaryThumbnail } from "@/lib/utils";
import { updateFeedbackStatus, deleteFeedback } from "./actions";

type Feedback = {
  id: string;
  customer_name: string | null;
  complaint_text: string;
  photo_path: string | null;
  photo_url: string | null;
  is_anonymous: boolean;
  status: string;
  created_at: string;
};

// Shell kartu ini SAMA persis polanya (glass + shadow berlapis) dengan
// kartu di halaman feedback pelanggan - lihat feedback-card.tsx.
const CARD_SHELL =
  "rounded-2xl border border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(19,35,32,0.03),0_20px_45px_-25px_rgba(19,35,32,0.25)] backdrop-blur-xl";

// HARUS sama dengan RETENTION_DAYS di app/api/cron/cleanup/route.ts -
// kalau salah satu diubah, ubah yang lain juga supaya keterangan di
// halaman ini tidak menyesatkan owner.
const RETENTION_DAYS = 30;

// Sisa hari sebelum keluhan ini kena hapus otomatis oleh cron cleanup.
function daysUntilDeleted(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(RETENTION_DAYS - ageDays));
}

// Susun isi CSV (tanpa BOM) - dipakai baik untuk download CSV polos
// maupun buat ditaruh di dalam ZIP bareng foto-fotonya.
function buildCsvContent(items: Feedback[]): string {
  const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const header = ["Tanggal", "Nama", "Anonim", "Pesan", "Status", "Link Foto"];

  const rows = items.map((f) => [
    new Date(f.created_at).toLocaleString("id-ID"),
    f.is_anonymous ? "" : f.customer_name || "-",
    f.is_anonymous ? "Ya" : "Tidak",
    f.complaint_text,
    f.status,
    f.photo_url ?? "",
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

// Komponen kecil di bawah ini SENGAJA ditaruh di luar FeedbackTable.
// Kalau dideklarasikan di dalamnya, React menganggap tiap render itu
// komponen "baru" dan membongkar-pasang ulang seluruh baris (termasuk
// gambar) setiap ada state berubah - termasuk tiap kali progres ZIP
// bertambah. Di luar, React cukup memperbarui yang berubah saja.

function Photo({
  f,
  onPreview,
  onViewLegacy,
  loadingPhoto,
}: {
  f: Feedback;
  onPreview: (url: string) => void;
  onViewLegacy: (f: Feedback) => void;
  loadingPhoto: boolean;
}) {
  if (f.photo_url) {
    const url = f.photo_url;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cloudinaryThumbnail(url)}
        alt="Foto bukti keluhan"
        loading="lazy"
        onClick={() => onPreview(url)}
        className="h-14 w-14 shrink-0 cursor-pointer rounded-md border border-black/[0.08] object-cover transition hover:opacity-80"
      />
    );
  }
  if (f.photo_path) {
    return (
      <button
        onClick={() => onViewLegacy(f)}
        disabled={loadingPhoto}
        className="shrink-0 text-sm text-[var(--brand)] underline underline-offset-2"
      >
        Lihat
      </button>
    );
  }
  return <span className="text-xs text-[#132320]/40">-</span>;
}

// Hitung mundur per keluhan - merah kalau tinggal seminggu atau
// kurang, biar owner sadar mana yang perlu segera diunduh.
function ExpiryNote({ f }: { f: Feedback }) {
  const days = daysUntilDeleted(f.created_at);
  const soon = days <= 7;
  return (
    <p
      className={`mt-0.5 flex items-center gap-1 text-[11px] ${
        soon ? "font-medium text-[#B5585E]" : "text-[#132320]/40"
      }`}
    >
      <Clock className="h-3 w-3 shrink-0" />
      {days <= 0 ? "Segera dihapus" : `Dihapus ${days} hari lagi`}
    </p>
  );
}

function StatusButton({
  f,
  onToggle,
}: {
  f: Feedback;
  onToggle: (id: string, current: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(f.id, f.status)}
      className="flex min-h-11 items-center py-2"
    >
      <Badge
        className={
          f.status === "Resolved"
            ? "bg-[var(--brand)] hover:bg-[var(--brand-dark)]"
            : "bg-[#B5585E] hover:bg-[#9c4a50]"
        }
      >
        {f.status}
      </Badge>
    </button>
  );
}

// Tanggal & jam dipisah jadi 2 baris supaya kolom tanggal tidak perlu
// lebar dan tidak menabrak kolom nama di sebelahnya.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DeleteButton({
  f,
  onDelete,
  labeled = false,
}: {
  f: Feedback;
  onDelete: (f: Feedback) => void;
  labeled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onDelete(f)}
      aria-label="Hapus keluhan"
      title="Hapus keluhan"
      className={`flex items-center justify-center gap-1.5 rounded-lg text-[#B5585E] transition hover:bg-[#B5585E]/10 ${
        labeled ? "h-9 px-3 text-xs font-medium" : "h-9 w-9"
      }`}
    >
      <Trash2 className="h-4 w-4" />
      {labeled && "Hapus"}
    </button>
  );
}

export function FeedbackTable({ feedbacks }: { feedbacks: Feedback[] }) {
  const [items, setItems] = useState(feedbacks);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const router = useRouter();
  const [downloadingZip, setDownloadingZip] = useState(false);
  // Keluhan yang sedang menunggu konfirmasi hapus.
  const [deleteTarget, setDeleteTarget] = useState<Feedback | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Keterangan proses ZIP supaya owner tahu sudah berjalan:
  // fase "foto" = lagi ambil foto satu-satu (done/total),
  // fase "zip" = semua foto sudah terambil, lagi disusun jadi 1 file.
  const [zipProgress, setZipProgress] = useState<{
    phase: "foto" | "zip";
    done: number;
    total: number;
    failed: number;
  } | null>(null);

  // Foto baru pakai photo_url (Cloudinary, langsung publik, tidak perlu
  // signed URL). Foto LAMA (sebelum migrasi Cloudinary) masih pakai
  // photo_path di Supabase Storage - tetap didukung biar riwayat lama
  // tidak hilang aksesnya.
  async function handleViewPhoto(f: Feedback) {
    if (f.photo_url) {
      setPreviewUrl(f.photo_url);
      return;
    }

    if (!f.photo_path) return;

    setLoadingPhoto(true);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("complaint-photos")
      .createSignedUrl(f.photo_path, 3600);

    setLoadingPhoto(false);

    if (error || !data) {
      alert("Gagal memuat foto.");
      return;
    }
    setPreviewUrl(data.signedUrl);
  }

  async function handleToggleStatus(id: string, current: string) {
    const next = current === "Pending" ? "Resolved" : "Pending";
    // Optimistic update
    setItems((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: next } : f))
    );

    const result = await updateFeedbackStatus(id, next);
    if (!result.success) {
      // rollback kalau gagal
      setItems((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: current } : f))
      );
      alert(result.error ?? "Gagal mengubah status.");
    }
  }

  function openDeleteDialog(f: Feedback) {
    setDeleteError(null);
    setDeleteTarget(f);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);

    const result = await deleteFeedback(deleteTarget.id);
    setDeleting(false);

    if (!result.success) {
      setDeleteError(result.error ?? "Gagal menghapus keluhan.");
      return;
    }

    setItems((prev) => prev.filter((f) => f.id !== deleteTarget.id));
    setDeleteTarget(null);
    // Segarkan data server supaya angka badge "Rekap Keluhan" di menu
    // samping ikut berkurang.
    router.refresh();
  }

  // Backup manual sebelum kena hapus otomatis - keluhan yang lebih tua
  // dari 30 hari dibersihkan sendiri oleh cron cleanup, jadi ini
  // satu-satunya cara owner simpan datanya kalau perlu arsip lebih lama.
  // CATATAN: ini cuma nyimpen LINK fotonya, bukan fotonya sendiri -
  // begitu foto aslinya kehapus dari Cloudinary (bareng cleanup 30
  // hari), link ini ikut mati walau file CSV-nya sudah kamu simpan.
  // Kalau mau fotonya beneran awet, pakai "Download CSV + Foto (ZIP)".
  function handleDownloadCsv() {
    const csvContent = buildCsvContent(items);

    // Tambah BOM (\uFEFF) di depan supaya Excel baca karakter
    // Indonesia (é, spasi non-standar, dll) dengan benar, bukan
    // jadi karakter aneh.
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8",
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    saveAs(blob, `rekap-keluhan-${todayStr}.csv`);
  }

  // Versi lengkap: CSV + file foto ASLI dibungkus 1 ZIP, supaya tetap
  // ada walau file di Cloudinary sudah dihapus cron cleanup.
  async function handleDownloadZip() {
    setDownloadingZip(true);
    setZipProgress({
      phase: "foto",
      done: 0,
      total: items.filter((f) => f.photo_url).length,
      failed: 0,
    });
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      zip.file(
        "rekap-keluhan.csv",
        "\uFEFF" + buildCsvContent(items)
      );

      const photoFolder = zip.folder("foto");
      const withPhoto = items.filter((f) => f.photo_url);

      await Promise.allSettled(
        withPhoto.map(async (f, i) => {
          try {
          const res = await fetch(f.photo_url as string);
          if (!res.ok) throw new Error("fetch gagal");
          const blob = await res.blob();

          // Ambil ekstensi dari URL aslinya kalau ada, fallback .jpg.
          const match = (f.photo_url as string).match(/\.(\w{3,4})(?:\?|$)/);
          const ext = match ? match[1] : "jpg";
          const dateStr = new Date(f.created_at)
            .toISOString()
            .slice(0, 10);
          const namePart = (f.customer_name || "anonim")
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .slice(0, 30);

          photoFolder?.file(
            `${dateStr}_${namePart}_${i + 1}.${ext}`,
            blob
          );
          setZipProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          } catch {
            // Foto ini gagal diambil - dilewati, tapi tetap dihitung
            // supaya angka progres jalan terus sampai selesai.
            setZipProgress((p) =>
              p ? { ...p, done: p.done + 1, failed: p.failed + 1 } : p
            );
          }
        })
      );

      setZipProgress((p) => (p ? { ...p, phase: "zip" } : p));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const todayStr = new Date().toISOString().slice(0, 10);
      saveAs(zipBlob, `rekap-keluhan-${todayStr}.zip`);
    } catch {
      alert("Gagal membuat file ZIP. Coba lagi sebentar lagi.");
    } finally {
      setDownloadingZip(false);
      setZipProgress(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className={`${CARD_SHELL} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F6F8F7] text-[#132320]/30">
          <Inbox className="h-5 w-5" />
        </span>
        <p className="text-sm text-[#132320]/50">Belum ada keluhan masuk.</p>
        <p className="text-xs text-[#132320]/35">
          Keluhan yang masuk akan otomatis dihapus setelah {RETENTION_DAYS} hari.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        role="note"
        className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900/80"
      >
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Keluhan <b>otomatis dihapus {RETENTION_DAYS} hari</b> setelah
          masuk, termasuk foto buktinya. Unduh dulu kalau mau disimpan
          lebih lama.
        </p>
      </div>

      <div className="mb-3 flex justify-end">
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleDownloadCsv}
            title="Cuma data teks + link foto (link ikut mati setelah 30 hari)"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3 text-xs font-medium text-[#132320] transition hover:bg-black/[0.03]"
          >
            <Download className="h-3.5 w-3.5" />
            CSV saja
          </button>
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            title="CSV + file foto asli, aman walau Cloudinary sudah dibersihkan"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#132320] px-3 text-xs font-medium text-white transition hover:bg-[#0B1512] disabled:opacity-60"
          >
            {downloadingZip ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderDown className="h-3.5 w-3.5" />
            )}
            {downloadingZip ? "Sedang diproses..." : "CSV + Foto (ZIP)"}
          </button>
        </div>
      </div>

      {/* Keterangan proses ZIP - muncul selama download berjalan supaya
          owner tahu sistemnya tidak hang. */}
      {zipProgress && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 rounded-xl border border-black/[0.06] bg-white/90 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-[#132320]">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--brand)]" />
            {zipProgress.phase === "foto"
              ? zipProgress.total === 0
                ? "Menyiapkan file..."
                : `Mengunduh foto ${zipProgress.done} dari ${zipProgress.total}...`
              : "Menyusun file ZIP..."}
          </div>

          {zipProgress.total > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-all duration-300"
                style={{
                  width: `${
                    zipProgress.phase === "zip"
                      ? 100
                      : Math.round((zipProgress.done / zipProgress.total) * 100)
                  }%`,
                }}
              />
            </div>
          )}

          <p className="mt-2 text-xs text-[#132320]/50">
            Jangan tutup atau pindah halaman dulu. File akan otomatis
            terunduh setelah selesai.
            {zipProgress.failed > 0 &&
              ` (${zipProgress.failed} foto gagal diambil dan dilewati)`}
          </p>
        </div>
      )}

      {/* Tampilan HP / tablet / laptop kecil: kartu bertumpuk, tanpa
          scroll horizontal, lebih enak dibaca & disentuh jari. Tabel
          baru dipakai mulai layar lebar (xl) karena di lg ada sidebar
          yang makan tempat sehingga kolom jadi sempit. */}
      <div className="flex flex-col gap-3 xl:hidden">
        {items.map((f) => (
          <div key={f.id} className={`${CARD_SHELL} p-4`}>
            <div className="flex gap-3">
              <Photo
                f={f}
                onPreview={setPreviewUrl}
                onViewLegacy={handleViewPhoto}
                loadingPhoto={loadingPhoto}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#132320]">
                      {f.is_anonymous ? (
                        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs text-[#132320]/60">
                          Anonim
                        </span>
                      ) : (
                        f.customer_name || "-"
                      )}
                    </p>
                    <p className="text-xs text-[#132320]/50">
                      {formatDate(f.created_at)}, {formatTime(f.created_at)}
                    </p>
                  </div>
                  <StatusButton f={f} onToggle={handleToggleStatus} />
                </div>
                <p className="mt-2 break-words text-sm text-[#132320]/80">
                  {f.complaint_text}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.05] pt-2">
              <ExpiryNote f={f} />
              <DeleteButton f={f} onDelete={openDeleteDialog} labeled />
            </div>
          </div>
        ))}
      </div>

      {/* Tampilan layar lebar: tabel. Lebar kolom dibuat longgar dan
          tabel diberi lebar minimum, jadi kalau tetap kesempitan dia
          scroll ke samping - bukan saling menimpa antar kolom. */}
      <div className={`${CARD_SHELL} hidden overflow-hidden xl:block`}>
        <Table className="min-w-[860px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-40 px-4 py-3">Tanggal</TableHead>
              <TableHead className="w-36 px-4 py-3">Nama</TableHead>
              <TableHead className="px-4 py-3">Pesan</TableHead>
              <TableHead className="w-24 px-4 py-3">Foto</TableHead>
              <TableHead className="w-32 px-4 py-3">Status</TableHead>
              <TableHead className="w-16 px-4 py-3 text-right">
                <span className="sr-only">Aksi</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="px-4 py-3 align-top">
                  <p className="text-sm text-[#132320]/80">
                    {formatDate(f.created_at)}
                  </p>
                  <p className="text-xs text-[#132320]/45">
                    {formatTime(f.created_at)}
                  </p>
                  <ExpiryNote f={f} />
                </TableCell>
                <TableCell className="px-4 py-3 align-top whitespace-normal break-words">
                  {f.is_anonymous ? (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs text-[#132320]/60">
                      Anonim
                    </span>
                  ) : (
                    f.customer_name || "-"
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 align-top whitespace-normal">
                  {/* line-clamp TIDAK boleh dipasang di sel tabel itu
                      sendiri (mengubah display-nya dan merusak layout
                      tabel) - makanya dibungkus div di dalamnya. */}
                  <div
                    className="line-clamp-3 break-words"
                    title={f.complaint_text}
                  >
                    {f.complaint_text}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 align-top">
                  <Photo
                    f={f}
                    onPreview={setPreviewUrl}
                    onViewLegacy={handleViewPhoto}
                    loadingPhoto={loadingPhoto}
                  />
                </TableCell>
                <TableCell className="px-4 py-3 align-top">
                  <StatusButton f={f} onToggle={handleToggleStatus} />
                </TableCell>
                <TableCell className="px-4 py-3 text-right align-top">
                  <DeleteButton f={f} onDelete={openDeleteDialog} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Foto bukti keluhan</DialogTitle>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Foto bukti keluhan"
              className="w-full rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus - WAJIB ada karena penghapusan permanen. */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          // Jangan bisa ditutup selagi proses hapus berjalan.
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus keluhan ini?</DialogTitle>
            <DialogDescription>
              Keluhan
              {deleteTarget && !deleteTarget.is_anonymous && deleteTarget.customer_name
                ? ` dari ${deleteTarget.customer_name}`
                : ""}{" "}
              akan dihapus permanen
              {deleteTarget?.photo_url || deleteTarget?.photo_path
                ? ", termasuk foto buktinya"
                : ""}
              . Tindakan ini tidak bisa dibatalkan. Unduh dulu (CSV/ZIP)
              kalau masih perlu arsipnya.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="rounded-lg bg-[#B5585E]/10 px-3 py-2 text-sm text-[#B5585E]">
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="bg-[#B5585E] text-white hover:bg-[#9c4a50]"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menghapus...
                </>
              ) : (
                "Ya, hapus"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
