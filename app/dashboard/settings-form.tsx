"use client";
// app/dashboard/settings-form.tsx

import { useState, type ChangeEvent, type FormEvent } from "react";
import { SlidersHorizontal, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  compressComplaintPhoto,
  uploadToCloudinaryWithProgress,
} from "@/lib/utils";
import {
  updateSettings,
  removeLogo,
  removeCoverImage,
} from "./actions";
import { useStore } from "./store-context";

type Product = {
  id: string;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  cover_position: string | null;
  brand_color: string | null;
};

const HEADING = { fontFamily: "var(--font-admin-heading)" };

// Shell kartu ini SAMA persis polanya (glass + shadow berlapis) dengan
// kartu di halaman feedback pelanggan - lihat feedback-card.tsx.
const CARD_SHELL =
  "rounded-2xl border border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(19,35,32,0.03),0_20px_45px_-25px_rgba(19,35,32,0.25)] backdrop-blur-xl";

const COLOR_PRESETS = [
  { name: "Teal (Default)", value: "#0E7C86" },
  { name: "Merah Bata", value: "#B5585E" },
  { name: "Emas", value: "#B45309" },
  { name: "Ungu", value: "#6D28D9" },
  { name: "Biru", value: "#2563EB" },
  { name: "Hijau Daun", value: "#15803D" },
];

// Sengaja pakai 2 SLIDER (bukan drag langsung di atas foto). Drag
// manual gampang meleset hitungan batasnya (bisa "nyangkut" di ujung
// atau lompat-lompat kalau logic-nya kurang presisi) - slider lebih
// pasti benar & preview-nya tetap live saat digeser.
function CoverPositioner({
  imageSrc,
  posX,
  posY,
  onChange,
}: {
  imageSrc: string;
  posX: number;
  posY: number;
  onChange: (x: number, y: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-black/[0.06] bg-white p-3">
      {/* Rasio preview ini SAMA dengan rasio banner asli di halaman
          feedback (lebar kartu ~kali tinggi banner 144-160px) -
          jadi apa yang keliatan di sini = apa yang keliatan nanti. */}
      <div className="relative aspect-[10/4] w-full overflow-hidden rounded-lg border border-black/[0.08] bg-[#F6F8F7]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Preview posisi foto sampul"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${posX}% ${posY}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Geser Horizontal</Label>
          <input
            type="range"
            min={0}
            max={100}
            value={posX}
            onChange={(e) => onChange(Number(e.target.value), posY)}
            className="mt-1.5 h-11 w-full accent-[var(--brand)]"
          />
        </div>
        <div>
          <Label className="text-xs">Geser Vertikal</Label>
          <input
            type="range"
            min={0}
            max={100}
            value={posY}
            onChange={(e) => onChange(posX, Number(e.target.value))}
            className="mt-1.5 h-11 w-full accent-[var(--brand)]"
          />
        </div>
      </div>
    </div>
  );
}

function parsePosition(value: string | null): { x: number; y: number } {
  if (!value) return { x: 50, y: 50 };
  const [x, y] = value.split(" ").map((v) => parseInt(v, 10));
  return {
    x: Number.isFinite(x) ? x : 50,
    y: Number.isFinite(y) ? y : 50,
  };
}

export function SettingsForm({ product }: { product: Product }) {
  // updateStore() dari StoreProvider - dipakai untuk "menyiarkan"
  // perubahan ke header dashboard & tab Cetak QR SETELAH data yang
  // sama sudah tersimpan di Supabase lewat updateSettings()/removeLogo()
  // di bawah. Tidak ada query tambahan sama sekali ke Supabase -
  // nilainya diambil dari apa yang sudah kita punya di form ini.
  const { updateStore } = useStore();

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    product.logo_url
  );
  const [removingLogo, setRemovingLogo] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(
    product.cover_image_url
  );
  const [removingCover, setRemovingCover] = useState(false);

  const initialPos = parsePosition(product.cover_position);
  const [coverPosX, setCoverPosX] = useState(initialPos.x);
  const [coverPosY, setCoverPosY] = useState(initialPos.y);

  const [brandColor, setBrandColor] = useState(
    product.brand_color || "#0E7C86"
  );

  async function handleRemoveLogo() {
    if (!logoPreview) return;
    const confirmed = confirm("Hapus logo toko saat ini?");
    if (!confirmed) return;

    setRemovingLogo(true);
    const result = await removeLogo(product.id, logoPreview);
    setRemovingLogo(false);

    if (!result.success) {
      alert(result.error ?? "Gagal menghapus logo.");
      return;
    }

    setLogoPreview(null);
    setLogoFile(null);
    updateStore({ logoUrl: null });
  }

  async function handleRemoveCover() {
    if (!coverPreview) return;
    const confirmed = confirm("Hapus foto sampul toko saat ini?");
    if (!confirmed) return;

    setRemovingCover(true);
    const result = await removeCoverImage(product.id, coverPreview);
    setRemovingCover(false);

    if (!result.success) {
      alert(result.error ?? "Gagal menghapus foto sampul.");
      return;
    }

    setCoverPreview(null);
    setCoverFile(null);
    setCoverPosX(50);
    setCoverPosY(50);
    // Foto sampul cuma dipakai di halaman feedback, tidak ditampilkan
    // di header/sidebar dashboard - jadi tidak perlu ikut disiarkan
    // lewat updateStore() seperti logo/nama/warna.
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleCoverChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    // Foto baru - posisi direset ke tengah, owner atur ulang kalau perlu.
    setCoverPosX(50);
    setCoverPosY(50);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);
    setProgress(0);

    // PENTING: ambil FormData SEBELUM ada `await` apapun. Begitu event
    // handler ini "jeda" di await pertama, browser sudah melepas
    // referensi e.currentTarget (jadi null) - makanya harus ditangkap
    // di awal, bukan setelah proses upload logo/cover selesai.
    const form = new FormData(e.currentTarget);
    const businessName = String(form.get("businessName") ?? "");

    try {
      let uploadedLogoUrl: string | undefined;
      let uploadedCoverUrl: string | undefined;

      // Alokasi persentase: tiap file yang perlu diupload dapat porsi
      // rata dari 90% pertama, 10% sisanya buat proses simpan ke
      // database. Kalau tidak ada file sama sekali, langsung ke 95%.
      const uploadCount = (logoFile ? 1 : 0) + (coverFile ? 1 : 0);
      const weightPerUpload = uploadCount > 0 ? 90 / uploadCount : 0;
      let doneWeight = 0;

      if (logoFile) {
        const compressed = await compressComplaintPhoto(logoFile);
        uploadedLogoUrl = await uploadToCloudinaryWithProgress(
          compressed,
          (pct) => {
            setProgress(Math.round(doneWeight + (pct / 100) * weightPerUpload));
          }
        );
        doneWeight += weightPerUpload;
        setProgress(Math.round(doneWeight));
      }

      if (coverFile) {
        const compressedCover = await compressComplaintPhoto(coverFile);
        uploadedCoverUrl = await uploadToCloudinaryWithProgress(
          compressedCover,
          (pct) => {
            setProgress(Math.round(doneWeight + (pct / 100) * weightPerUpload));
          }
        );
        doneWeight += weightPerUpload;
        setProgress(Math.round(doneWeight));
      }

      setProgress(95);

      const result = await updateSettings(product.id, {
        businessName,
        googleReviewUrl: String(form.get("googleReviewUrl") ?? ""),
        ownerWhatsapp: String(form.get("ownerWhatsapp") ?? ""),
        logoUrl: uploadedLogoUrl,
        coverImageUrl: uploadedCoverUrl,
        // Dikirim tiap kali ADA foto sampul aktif (baru ataupun yang
        // lama) - supaya geser posisi TANPA ganti foto pun tetap
        // kesimpen.
        coverPosition: coverPreview ? `${coverPosX}% ${coverPosY}%` : undefined,
        brandColor,
      });

      if (!result.success) {
        setError(result.error ?? "Gagal menyimpan.");
        setProgress(0);
        return;
      }

      setProgress(100);
      setMessage("Pengaturan berhasil disimpan.");

      // Data yang baru disimpan ini SUDAH ada di tangan kita (form ini
      // sendiri yang mengirimnya) - jadi header dashboard & tab Cetak
      // QR bisa langsung dikasih tahu tanpa nanya balik ke Supabase.
      updateStore({
        businessName,
        logoUrl: uploadedLogoUrl ?? logoPreview,
        brandColor,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setProgress(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`${CARD_SHELL} max-w-md space-y-6 p-6`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{
            background:
              "linear-gradient(135deg, var(--brand), var(--brand-dark))",
          }}
        >
          <SlidersHorizontal className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-[#132320]" style={HEADING}>
            Pengaturan Toko
          </h2>
          <p className="text-sm text-[#132320]/55">
            Perubahan langsung berlaku di dashboard & halaman feedback.
          </p>
        </div>
      </div>

      <div className="space-y-5 border-t border-black/[0.06] pt-5">
        <div>
          <Label>Logo Toko</Label>
          <div className="mt-2 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-black/[0.08] bg-white">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="Logo toko"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-[10px] text-[#132320]/30">
                  Belum ada
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="h-11 flex-1 text-sm file:h-full"
              />
              {logoPreview && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={removingLogo}
                  onClick={handleRemoveLogo}
                  className="h-11 border-[#B5585E]/30 text-[#B5585E] hover:bg-[#B5585E]/5"
                >
                  {removingLogo ? "Menghapus..." : "Hapus Logo"}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-[#132320]/45">
            Logo bentuk kotak/persegi - muncul di dashboard & sebagai ikon di
            halaman feedback pelanggan.
          </p>
        </div>

        {/* Foto Sampul - beda dari Logo: ini gambar LEBAR (landscape),
            tampil sebagai banner di paling atas halaman feedback
            pelanggan. Kalau tidak diisi, halaman feedback tetap tampil
            rapi seperti biasa (tidak ada bagian yang kosong/rusak). */}
        <div className="border-t border-black/[0.06] pt-5">
          <Label className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-[#132320]/40" />
            Foto Sampul (Opsional)
          </Label>
          <div className="mt-2 space-y-3">
            {!coverPreview && (
              <div className="flex h-24 w-full items-center justify-center rounded-xl border border-black/[0.08] bg-[#F6F8F7] text-[11px] text-[#132320]/30">
                Belum ada foto sampul
              </div>
            )}

            {coverPreview && (
              <CoverPositioner
                imageSrc={coverPreview}
                posX={coverPosX}
                posY={coverPosY}
                onChange={(x, y) => {
                  setCoverPosX(x);
                  setCoverPosY(y);
                }}
              />
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="file"
                accept="image/*"
                onChange={handleCoverChange}
                className="h-11 flex-1 text-sm file:h-full"
              />
              {coverPreview && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={removingCover}
                  onClick={handleRemoveCover}
                  className="h-11 border-[#B5585E]/30 text-[#B5585E] hover:bg-[#B5585E]/5"
                >
                  {removingCover ? "Menghapus..." : "Hapus Sampul"}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-[#132320]/45">
            Foto lebar (mis. interior toko, produk). Kalau bagian penting
            fotonya kepotong, geser pakai 2 slider di atas preview - posisinya
            ikut tersimpan waktu klik &quot;Simpan Pengaturan&quot; di bawah.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="businessName">Nama Toko / Bisnis</Label>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={product.business_name ?? ""}
            required
            className="h-11 text-base"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="googleReviewUrl">Link Google Review</Label>
          <Input
            id="googleReviewUrl"
            name="googleReviewUrl"
            type="url"
            defaultValue={product.google_review_url ?? ""}
            required
            className="h-11 text-base"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="ownerWhatsapp">Nomor WhatsApp Owner</Label>
          <Input
            id="ownerWhatsapp"
            name="ownerWhatsapp"
            defaultValue={product.owner_whatsapp ?? ""}
            required
            className="h-11 text-base"
          />
        </div>

        <div>
          <Label>Warna Tema</Label>
          <p className="mt-1 text-xs text-[#132320]/45">
            Dipakai untuk warna aksen di dashboard kamu dan tombol &quot;Puas
            / Bagus&quot; di halaman feedback pelanggan.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.name}
                onClick={() => setBrandColor(preset.value)}
                className="h-11 w-11 shrink-0 rounded-full border-2 transition active:scale-95"
                style={{
                  backgroundColor: preset.value,
                  borderColor:
                    brandColor.toLowerCase() === preset.value.toLowerCase()
                      ? "#132320"
                      : "transparent",
                }}
              />
            ))}
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-black/[0.1] bg-transparent p-0.5"
              title="Warna custom"
            />
            <span className="text-xs text-[#132320]/50">{brandColor}</span>
          </div>
        </div>

        {message && <p className="text-sm text-[var(--brand)]">{message}</p>}
        {error && <p className="text-sm text-[#B5585E]">{error}</p>}

        {/* Tombol simpan - bar isi persentase di dalamnya sama persis
            polanya dengan tombol "Kirim Masukan" di halaman feedback
            pelanggan, jadi bahasa visualnya konsisten. */}
        <Button
          type="submit"
          disabled={loading}
          className="relative h-11 w-full overflow-hidden bg-[var(--brand)] text-base hover:bg-[var(--brand-dark)]"
          style={HEADING}
        >
          {loading && (
            <span
              className="absolute inset-y-0 left-0 bg-white/15 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          )}
          <span className="relative flex items-center justify-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? `Menyimpan... ${progress}%` : "Simpan Pengaturan"}
          </span>
        </Button>
      </div>
    </form>
  );
}
