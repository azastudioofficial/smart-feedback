"use client";
// app/dashboard/qr-tab.tsx

import { useState } from "react";
import { QrCode, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrDesignerFields } from "@/components/qr-designer-fields";
import { darkenHex } from "@/lib/utils";
import {
  DEFAULT_QR_DESIGN,
  buildQrStylingOptions,
  triggerBlobDownload,
  type QrDesign,
} from "@/lib/qr-design";

// Shell kartu ini SAMA persis polanya (glass + shadow berlapis) dengan
// kartu di halaman feedback pelanggan - lihat feedback-card.tsx. Dua
// permukaan ini yang paling sering dilihat (pelanggan & owner), jadi
// sengaja disamakan level "kemewahan" visualnya.
const CARD_SHELL =
  "rounded-2xl border border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(19,35,32,0.03),0_20px_45px_-25px_rgba(19,35,32,0.25)] backdrop-blur-xl";

export function QrTab({
  shortCode,
  brandColor,
}: {
  shortCode: string;
  brandColor?: string | null;
}) {
  const [design, setDesign] = useState<QrDesign>(() =>
    brandColor
      ? {
          ...DEFAULT_QR_DESIGN,
          preset: "custom",
          color1: brandColor,
          color2: darkenHex(brandColor, 20),
        }
      : DEFAULT_QR_DESIGN
  );
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [loading, setLoading] = useState(false);

  const qrValue =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${shortCode}`
      : `/r/${shortCode}`;

  async function handleDownload() {
    setLoading(true);
    try {
      const { default: QRCodeStyling } = await import("qr-code-styling");
      const qr = new QRCodeStyling(
        buildQrStylingOptions(design, qrValue, 1000)
      );
      const blob = await qr.getRawData(format);
      if (blob) {
        triggerBlobDownload(blob as Blob, `qr-${shortCode}.${format}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`${CARD_SHELL} p-6`}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{
            background:
              "linear-gradient(135deg, var(--brand), var(--brand-dark))",
          }}
        >
          <QrCode className="h-5 w-5" />
        </span>
        <div>
          <h2
            className="text-lg font-bold text-[#132320]"
            style={{ fontFamily: "var(--font-admin-heading)" }}
          >
            Cetak Ulang QR Toko
          </h2>
          <p className="text-sm text-[#132320]/55">
            Custom tampilan QR kamu sendiri, tanpa perlu hubungi admin.
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-black/[0.06] pt-5">
        <QrDesignerFields
          design={design}
          onChange={setDesign}
          previewValue={qrValue}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-5">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as "png" | "svg")}
          className="h-11 rounded-lg border border-input bg-transparent px-3 text-base"
        >
          <option value="png">PNG (1000px)</option>
          <option value="svg">SVG (Vektor)</option>
        </select>
        <Button
          onClick={handleDownload}
          disabled={loading}
          className="h-11 gap-1.5 bg-[var(--brand)] text-base hover:bg-[var(--brand-dark)]"
        >
          <Download className="h-4 w-4" />
          {loading ? "Menyiapkan..." : "Download QR"}
        </Button>
      </div>
    </div>
  );
}
