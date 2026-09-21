"use client";
// components/qr-designer-fields.tsx
// Dipakai bersama oleh Admin (batch) dan Dashboard Owner (single QR).

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { QR_PRESETS, buildQrStylingOptions, type QrDesign } from "@/lib/qr-design";

type Props = {
  design: QrDesign;
  onChange: (next: QrDesign) => void;
  previewValue: string;
};

// h-11 (44px) - standar minimum area sentuh yang nyaman buat jari di
// HP/tablet (rekomendasi Apple 44px / Google 48dp). Sebelumnya h-9.
const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base";

export function QrDesignerFields({ design, onChange, previewValue }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qrInstanceRef = useRef<any>(null);

  // PENTING UNTUK PERFORMA: library qr-code-styling (~cukup besar)
  // baru dimuat browser setelah panel ini benar-benar disentuh
  // (fokus/hover), BUKAN otomatis saat halaman/tab dibuka. Jadi kalau
  // admin/owner cuma lihat statistik dan tidak pernah buka bagian ini,
  // library-nya tidak pernah ikut ter-download sama sekali.
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) return;
    let cancelled = false;

    async function renderPreview() {
      const { default: QRCodeStyling } = await import("qr-code-styling");
      if (cancelled || !previewRef.current) return;

      const options = buildQrStylingOptions(design, previewValue, 160);

      if (!qrInstanceRef.current) {
        qrInstanceRef.current = new QRCodeStyling(options);
        previewRef.current.innerHTML = "";
        qrInstanceRef.current.append(previewRef.current);
      } else {
        qrInstanceRef.current.update(options);
      }
    }

    renderPreview();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    touched,
    design.color1,
    design.color2,
    design.bgColor,
    design.dotStyle,
    design.cornerStyle,
    design.logoOption,
    design.customLogo,
    previewValue,
  ]);

  function applyPreset(key: string) {
    const p = QR_PRESETS[key];
    if (!p) return;
    onChange({ ...design, preset: key, ...p });
  }

  function handleLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      onChange({ ...design, customLogo: String(evt.target?.result ?? "") });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      className="space-y-4"
      onMouseEnter={() => setTouched(true)}
      onFocus={() => setTouched(true)}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Preset Desain</Label>
          <select
            value={design.preset}
            onChange={(e) => applyPreset(e.target.value)}
            className={selectClass}
          >
            <option value="modern_teal">Teal Modern</option>
            <option value="premium_gold">Emas Elegan</option>
            <option value="google_gradient">Google Gradient</option>
            <option value="classic_black">Hitam Klasik</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Logo di Tengah QR</Label>
          <select
            value={design.logoOption}
            onChange={(e) =>
              onChange({
                ...design,
                logoOption: e.target.value as QrDesign["logoOption"],
              })
            }
            className={selectClass}
          >
            <option value="none">Tanpa Logo</option>
            <option value="google_g">Logo &quot;G&quot; Google</option>
            <option value="custom">Upload Logo Sendiri</option>
          </select>
        </div>
      </div>

      {design.logoOption === "custom" && (
        <div className="space-y-1">
          <Label>File Logo (PNG/SVG)</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={handleLogoFile}
            className="h-11 text-sm file:h-full"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs">Warna 1</Label>
          <input
            type="color"
            value={design.color1}
            onChange={(e) => onChange({ ...design, color1: e.target.value })}
            className="h-11 w-full cursor-pointer rounded-md border border-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Warna 2</Label>
          <input
            type="color"
            value={design.color2}
            onChange={(e) => onChange({ ...design, color2: e.target.value })}
            className="h-11 w-full cursor-pointer rounded-md border border-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Latar</Label>
          <input
            type="color"
            value={design.bgColor}
            onChange={(e) => onChange({ ...design, bgColor: e.target.value })}
            className="h-11 w-full cursor-pointer rounded-md border border-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Gaya Titik</Label>
          <select
            value={design.dotStyle}
            onChange={(e) => onChange({ ...design, dotStyle: e.target.value })}
            className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="extra-rounded">Extra Rounded</option>
            <option value="classy">Classy</option>
            <option value="dots">Dots</option>
            <option value="rounded">Rounded</option>
            <option value="square">Square</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Gaya Sudut</Label>
          <select
            value={design.cornerStyle}
            onChange={(e) =>
              onChange({ ...design, cornerStyle: e.target.value })
            }
            className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="extra-rounded">Rounded</option>
            <option value="square">Kotak</option>
          </select>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs opacity-60">Preview</p>
        <div
          ref={previewRef}
          onMouseEnter={() => setTouched(true)}
          className="flex h-[160px] w-[160px] items-center justify-center rounded-xl border border-black/[0.08] bg-white text-xs text-black/30"
        >
          {!touched && "Sentuh untuk preview"}
        </div>
      </div>
    </div>
  );
}
