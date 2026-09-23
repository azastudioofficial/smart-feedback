"use client";
// app/dashboard/feedback-table.tsx

import { useState } from "react";
import { Inbox } from "lucide-react";
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

export function FeedbackTable({ feedbacks }: { feedbacks: Feedback[] }) {
  const [items, setItems] = useState(feedbacks);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

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
