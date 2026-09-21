"use client";
// components/pending-requests.tsx
// Dipakai bersama oleh /admin/master dan /reseller. RLS di database
// yang otomatis membatasi data mana yang boleh dilihat masing-masing.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { approveActivation, rejectActivation } from "@/app/actions/activation";

type PendingProduct = {
  id: string;
  short_code: string;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  created_at: string;
};

const HEADING = { fontFamily: "var(--font-admin-heading)" };
const MONO = { fontFamily: "var(--font-mono-ticket)" };

export function PendingRequests({
  requests,
}: {
  requests: PendingProduct[];
}) {
  const [items, setItems] = useState(requests);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setBusyId(id);
    const result = await approveActivation(id);
    setBusyId(null);

    if (!result.success) {
      alert(result.error ?? "Gagal menyetujui.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleReject(id: string, businessName: string | null) {
    const confirmed = confirm(
      `Tolak permohonan aktivasi "${
        businessName ?? "toko ini"
      }"? Data yang diisi akan dihapus dan kartu kembali jadi stok kosong.`
    );
    if (!confirmed) return;

    setBusyId(id);
    const result = await rejectActivation(id);
    setBusyId(null);

    if (!result.success) {
      alert(result.error ?? "Gagal menolak.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-6 text-center text-sm text-[#132320]/50 shadow-sm backdrop-blur">
        Tidak ada permohonan aktivasi yang menunggu.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 shadow-sm backdrop-blur">
      <div className="p-5">
        <h2 className="text-lg font-extrabold text-[#132320]" style={HEADING}>
          Permohonan Aktivasi ({items.length})
        </h2>
      </div>
      <div className="divide-y divide-black/[0.06]">
        {items.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
          >
            <div>
              <p className="font-semibold text-[#132320]">
                {p.business_name || "(Tanpa nama)"}
                <span className="ml-2 text-xs font-normal text-[#132320]/40" style={MONO}>
                  {p.short_code}
                </span>
              </p>
              <p className="text-xs text-[#132320]/50">
                WA: {p.owner_whatsapp || "-"}
                {p.google_review_url && (
                  <>
                    {" "}
                    &middot;{" "}
                    <a
                      href={p.google_review_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Link Review
                    </a>
                  </>
                )}
              </p>
            </div>
            {/* h-11 (44px) di kedua tombol - sebelumnya size="sm" (28px),
                terlalu kecil buat ditekan jempol di HP/tablet. */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busyId === p.id}
                onClick={() => handleReject(p.id, p.business_name)}
                className="h-11 text-[#B5585E]"
              >
                Tolak
              </Button>
              <Button
                disabled={busyId === p.id}
                onClick={() => handleApprove(p.id)}
                className="h-11 bg-[#0E7C86] hover:bg-[#0B5F67]"
              >
                Setujui
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
