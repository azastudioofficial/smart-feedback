"use client";
// components/qr-print-dialog.tsx
// Dipakai dari tabel inventory (admin & reseller) - klik "Cetak QR"
// pada satu kartu, bisa custom desainnya dulu sebelum diunduh.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { QrDesignerFields } from "@/components/qr-designer-fields";
import {
  DEFAULT_QR_DESIGN,
  buildQrStylingOptions,
  triggerBlobDownload,
  type QrDesign,
} from "@/lib/qr-design";

export function QrPrintDialog({
  shortCode,
  open,
  onOpenChange,
}: {
  shortCode: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [design, setDesign] = useState<QrDesign>(DEFAULT_QR_DESIGN);
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [loading, setLoading] = useState(false);

  const qrValue =
    typeof window !== "undefined" && shortCode
      ? `${window.location.origin}/r/${shortCode}`
      : `/r/${shortCode ?? ""}`;

  async function handleDownload() {
    if (!shortCode) return;
    setLoading(true);
    try {
      const { default: QRCodeStyling } = await import("qr-code-styling");
      const qr = new QRCodeStyling(
        buildQrStylingOptions(design, qrValue, 1000)
      );
      const blob = await qr.getRawData(format);
      if (blob) {
        triggerBlobDownload(blob as Blob, `${shortCode}.${format}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cetak QR — {shortCode}</DialogTitle>
        </DialogHeader>

        {shortCode && (
          <div className="space-y-4">
            <QrDesignerFields
              design={design}
              onChange={setDesign}
              previewValue={qrValue}
            />

            <div className="flex flex-wrap items-end gap-3 border-t border-black/[0.06] pt-4">
              <div className="space-y-1">
                <Label className="text-xs">Format</Label>
                <select
                  value={format}
                  onChange={(e) =>
                    setFormat(e.target.value as "png" | "svg")
                  }
                  className="h-11 rounded-md border border-input bg-transparent px-3 text-base"
                >
                  <option value="png">PNG (1000px)</option>
                  <option value="svg">SVG (Vektor)</option>
                </select>
              </div>
              <Button
                onClick={handleDownload}
                disabled={loading}
                className="h-11 bg-[#0E7C86] text-base hover:bg-[#0B5F67]"
              >
                {loading ? "Menyiapkan..." : "Download QR"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
