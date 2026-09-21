"use client";
// app/admin/master/batch-generator.tsx

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QrDesignerFields } from "@/components/qr-designer-fields";
import {
  DEFAULT_QR_DESIGN,
  buildQrStylingOptions,
  triggerBlobDownload,
  type QrDesign,
} from "@/lib/qr-design";
import { generateProducts, listResellers } from "./actions";

type GeneratedItem = { id: string; short_code: string };
type Reseller = { id: string; name: string; card_count: number };

const MONO = { fontFamily: "var(--font-mono-ticket)" };
const HEADING = { fontFamily: "var(--font-admin-heading)" };
// h-11 (44px) - standar minimum area sentuh buat HP/tablet. Sebelumnya h-9.
const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base";

export function BatchGenerator() {
  const [qty, setQty] = useState(10);
  const [prefix, setPrefix] = useState("");
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [design, setDesign] = useState<QrDesign>(DEFAULT_QR_DESIGN);
  const [resellerId, setResellerId] = useState<string>("");
  const [resellers, setResellers] = useState<Reseller[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedItem[]>([]);

  useEffect(() => {
    listResellers().then((res) => {
      if (res.success && res.data) setResellers(res.data);
    });
  }, []);

  async function downloadBatchQr(items: GeneratedItem[]) {
    const { default: QRCodeStyling } = await import("qr-code-styling");
    const baseUrl = window.location.origin;

    if (items.length === 1) {
      const qr = new QRCodeStyling(
        buildQrStylingOptions(design, `${baseUrl}/r/${items[0].short_code}`, 1000)
      );
      const blob = await qr.getRawData(format);
      if (blob) triggerBlobDownload(blob as Blob, `${items[0].short_code}.${format}`);
      return;
    }

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    await Promise.all(
      items.map(async (item) => {
        const qr = new QRCodeStyling(
          buildQrStylingOptions(design, `${baseUrl}/r/${item.short_code}`, 1000)
        );
        const blob = await qr.getRawData(format);
        if (blob) zip.file(`${item.short_code}.${format}`, blob as Blob);
      })
    );

    const content = await zip.generateAsync({ type: "blob" });
    triggerBlobDownload(content, `qr-batch-${Date.now()}.zip`);
  }

  function downloadCsv() {
    const baseUrl = window.location.origin;
    const header = "short_code,url,id\n";
    const rows = results
      .map((r) => `${r.short_code},${baseUrl}/r/${r.short_code},${r.id}`)
      .join("\n");
    const blob = new Blob([header + rows], {
      type: "text/csv;charset=utf-8;",
    });
    triggerBlobDownload(blob, `qr-batch-${Date.now()}.csv`);
  }

  async function handleGenerate() {
    setError(null);
    setLoading(true);

    const result = await generateProducts(qty, prefix, resellerId || null);

    if (!result.success || !result.data) {
      setLoading(false);
      setError(result.error ?? "Gagal generate QR.");
      return;
    }

    setResults(result.data);
    await downloadBatchQr(result.data);
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-6 shadow-sm backdrop-blur">
      <h2 className="text-lg font-extrabold text-[#132320]" style={HEADING}>
        Studio Desain QR
      </h2>
      <p className="mt-0.5 text-[13px] text-[#132320]/50">
        Kode dibuat otomatis, QR langsung terunduh untuk dicetak ke akrilik.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>Jumlah Kartu</Label>
          <Input
            type="number"
            min={1}
            max={200}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1">
          <Label>Prefix Kode (opsional)</Label>
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="AKR"
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1">
          <Label>Format File</Label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "png" | "svg")}
            className={selectClass}
          >
            <option value="png">PNG (1000px)</option>
            <option value="svg">SVG (Vektor)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Alokasikan ke Reseller</Label>
          <select
            value={resellerId}
            onChange={(e) => setResellerId(e.target.value)}
            className={selectClass}
          >
            <option value="">Tidak ada (langsung punya saya)</option>
            {resellers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <QrDesignerFields
          design={design}
          onChange={setDesign}
          previewValue={`${
            typeof window !== "undefined" ? window.location.origin : ""
          }/r/CONTOH1`}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-5">
        {error && <p className="w-full text-sm text-[#B5585E]">{error}</p>}
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="h-11 bg-[#0E7C86] text-base hover:bg-[#0B5F67]"
        >
          {loading ? "Membuat..." : "Buat Stok & Unduh QR"}
        </Button>
        {results.length > 0 && (
          <Button variant="outline" onClick={downloadCsv} className="h-11">
            Export CSV
          </Button>
        )}
        <p className="w-full text-xs text-[#132320]/45">
          Kalau lebih dari 1 kartu, semua QR otomatis dibungkus jadi satu file
          ZIP.
        </p>
      </div>

      {results.length > 0 && (
        <div className="mt-5">
          <div className="max-h-64 overflow-y-auto rounded-md border border-black/[0.06]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Short Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell style={MONO}>{r.short_code}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
