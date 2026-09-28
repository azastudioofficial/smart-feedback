"use client";
// app/dashboard/feedback-table.tsx

import { useState } from "react";
import { Inbox, Download, FolderDown, Loader2 } from "lucide-react";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cloudinaryThumbnail } from "@/lib/utils";
import { updateFeedbackStatus } from "./actions";

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

export function FeedbackTable({ feedbacks }: { feedbacks: Feedback[] }) {
  const [items, setItems] = useState(feedbacks);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
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
      </div>
    );
  }

  function Photo({ f }: { f: Feedback }) {
    if (f.photo_url) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cloudinaryThumbnail(f.photo_url)}
          alt="Foto bukti keluhan"
          loading="lazy"
          onClick={() => setPreviewUrl(f.photo_url)}
          className="h-14 w-14 shrink-0 cursor-pointer rounded-md border border-black/[0.08] object-cover transition hover:opacity-80"
        />
      );
    }
    if (f.photo_path) {
      return (
        <button
          onClick={() => handleViewPhoto(f)}
          disabled={loadingPhoto}
          className="shrink-0 text-sm text-[var(--brand)] underline underline-offset-2"
        >
          Lihat
        </button>
      );
    }
    return <span className="text-xs text-[#132320]/40">-</span>;
  }

  function StatusButton({ f }: { f: Feedback }) {
    return (
      <button
        onClick={() => handleToggleStatus(f.id, f.status)}
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

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#132320]/40">
          Keluhan otomatis terhapus setelah 30 hari (termasuk fotonya) -
          unduh dulu kalau mau simpan lebih lama.
        </p>
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

      {/* Tampilan HP / layar sempit: kartu bertumpuk, tanpa scroll
          horizontal, lebih enak dibaca & disentuh jari. */}
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((f) => (
          <div key={f.id} className={`${CARD_SHELL} flex gap-3 p-4`}>
            <Photo f={f} />
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
                    {new Date(f.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
                <StatusButton f={f} />
              </div>
              <p className="mt-2 break-words text-sm text-[#132320]/80">
                {f.complaint_text}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tampilan tablet/desktop: tabel, seperti sebelumnya. */}
      <div className={`${CARD_SHELL} hidden overflow-x-auto md:block`}>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Tanggal</TableHead>
              <TableHead className="w-24">Nama</TableHead>
              <TableHead>Pesan</TableHead>
              <TableHead className="w-16">Foto</TableHead>
              <TableHead className="w-20">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="whitespace-nowrap align-top text-xs text-[#132320]/50">
                  {new Date(f.created_at).toLocaleString("id-ID")}
                </TableCell>
                <TableCell className="align-top break-words">
                  {f.is_anonymous ? (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs text-[#132320]/60">
                      Anonim
                    </span>
                  ) : (
                    f.customer_name || "-"
                  )}
                </TableCell>
                <TableCell className="align-top whitespace-normal break-words line-clamp-3">
                  {f.complaint_text}
                </TableCell>
                <TableCell className="align-top">
                  <Photo f={f} />
                </TableCell>
                <TableCell className="align-top">
                  <StatusButton f={f} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-md">
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
    </>
  );
} 
