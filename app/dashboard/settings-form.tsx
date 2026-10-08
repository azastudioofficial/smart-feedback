"use client";
// app/dashboard/settings-form.tsx

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  SlidersHorizontal,
  ImageIcon,
  Loader2,
  Share2,
  Plus,
  Trash2,
  Pencil,
  X,
  ExternalLink,
  MapPin,
  MessageSquareCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  compressComplaintPhoto,
  compressIconImage,
  uploadToCloudinaryWithProgress,
  cloudinaryThumbnail,
} from "@/lib/utils";
import {
  updateSettings,
  removeLogo,
  removeCoverImage,
} from "./actions";
import {
  REVIEW_CARD_DEFAULT,
  COMPLAINT_CARD_DEFAULT,
  CARD_TITLE_MAX,
  CARD_DESCRIPTION_MAX,
} from "@/lib/feedback-cards";
import { useStore } from "./store-context";
import {
  SOCIAL_PLATFORM_META,
  SOCIAL_PLATFORM_ORDER,
  resolveDisplayGroup,
  newSocialLinkId,
  type SocialLink,
  type SocialPlatform,
} from "@/lib/social-links";

type Product = {
  id: string;
  short_code: string;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  cover_position: string | null;
  brand_color: string | null;
  social_links?: SocialLink[] | null;
  connect_title?: string | null;
  connect_description?: string | null;
  review_card_title?: string | null;
  review_card_description?: string | null;
  review_card_icon_url?: string | null;
  complaint_card_title?: string | null;
  complaint_card_description?: string | null;
  complaint_card_icon_url?: string | null;
};

const HEADING = { fontFamily: "var(--font-admin-heading)" };

// Satu blok kustomisasi untuk SATU kartu pilihan di halaman feedback
// (ikon + judul + keterangan). Kosong = pelanggan melihat bawaan; teks
// abu-abu di kolom (placeholder) adalah teks bawaan itu sendiri.
function CardCustomizer({
  heading,
  accent,
  defaults,
  defaultIcon,
  title,
  description,
  iconUrl,
  uploading,
  onTitle,
  onDescription,
  onPickIcon,
  onClearIcon,
  onReset,
}: {
  heading: string;
  accent: string;
  defaults: { title: string; description: string };
  defaultIcon: ReactNode;
  title: string;
  description: string;
  iconUrl: string | null;
  uploading: boolean;
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
  onPickIcon: () => void;
  onClearIcon: () => void;
  onReset: () => void;
}) {
  const customized = !!(title.trim() || description.trim() || iconUrl);
  return (
    <div className="space-y-2.5 rounded-xl border border-black/[0.07] bg-[#F6F8F7] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#132320]/70">{heading}</p>
        {customized && (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-medium text-[#0E7C86] hover:underline"
          >
            Kembalikan ke bawaan
          </button>
        )}
      </div>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onPickIcon}
            disabled={uploading}
            title="Klik untuk pakai ikon sendiri"
            aria-label={`Ganti ikon ${heading}`}
            className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-black/[0.06]"
            style={
              iconUrl
                ? { backgroundColor: "white" }
                : {
                    backgroundColor: `color-mix(in srgb, ${accent} 14%, white)`,
                    color: accent,
                  }
            }
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#132320]/50" />
            ) : iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cloudinaryThumbnail(iconUrl, "f_auto,q_auto,w_88")}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain p-1"
              />
            ) : (
              defaultIcon
            )}
            {!uploading && (
              <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-white group-hover:flex">
                <Pencil className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
          {iconUrl && !uploading && (
            <button
              type="button"
              onClick={onClearIcon}
              className="text-[10px] font-medium text-[#132320]/50 hover:text-red-600"
            >
              Hapus
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            maxLength={CARD_TITLE_MAX}
            placeholder={defaults.title}
            aria-label={`Judul ${heading}`}
            className="h-11 bg-white text-sm"
          />
          <Input
            value={description}
            onChange={(e) => onDescription(e.target.value)}
            maxLength={CARD_DESCRIPTION_MAX}
            placeholder={defaults.description}
            aria-label={`Keterangan ${heading}`}
            className="h-11 bg-white text-sm"
          />
        </div>
      </div>
    </div>
  );
}


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

export function SettingsForm({
  product,
  isPro,
}: {
  product: Product;
  // Basic tidak punya halaman feedback custom (pelanggan langsung
  // diarahkan ke Google Review), jadi field yang HANYA dipakai di
  // situ (preview halaman, foto sampul, tautan sosial) disembunyikan.
  // Logo & Warna Tema tetap tampil karena keduanya juga dipakai di
  // dashboard sendiri (lihat store-context.tsx: --brand & logoUrl
  // dipasang di sidebar utk SEMUA plan, bukan cuma di halaman
  // feedback pelanggan).
  isPro: boolean;
}) {
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

  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(
    product.social_links ?? []
  );

  // Judul & keterangan tombol "Terhubung dengan Kami" (opsional).
  // Kosong = pelanggan melihat teks bawaan yang netral.
  const [connectTitle, setConnectTitle] = useState(product.connect_title ?? "");
  const [connectDescription, setConnectDescription] = useState(
    product.connect_description ?? ""
  );

  // Kustomisasi dua kartu pilihan di halaman feedback (opsional, Pro).
  // Kosong = pelanggan melihat teks & ikon bawaan.
  const [reviewCardTitle, setReviewCardTitle] = useState(
    product.review_card_title ?? ""
  );
  const [reviewCardDescription, setReviewCardDescription] = useState(
    product.review_card_description ?? ""
  );
  const [reviewCardIconUrl, setReviewCardIconUrl] = useState<string | null>(
    product.review_card_icon_url ?? null
  );
  const [complaintCardTitle, setComplaintCardTitle] = useState(
    product.complaint_card_title ?? ""
  );
  const [complaintCardDescription, setComplaintCardDescription] = useState(
    product.complaint_card_description ?? ""
  );
  const [complaintCardIconUrl, setComplaintCardIconUrl] = useState<
    string | null
  >(product.complaint_card_icon_url ?? null);

  // Upload ikon kartu langsung begitu dipilih (pola sama dengan ikon
  // "Connect with Us"). File ikon lama dibersihkan server setelah Simpan.
  const cardIconInputRef = useRef<HTMLInputElement>(null);
  const [cardIconTarget, setCardIconTarget] = useState<
    "review" | "complaint" | null
  >(null);
  const [uploadingCardIcon, setUploadingCardIcon] = useState<
    "review" | "complaint" | null
  >(null);

  function triggerCardIconUpload(which: "review" | "complaint") {
    setCardIconTarget(which);
    cardIconInputRef.current?.click();
  }

  async function handleCardIconSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const target = cardIconTarget;
    e.target.value = "";
    if (!file || !target) return;

    if (file.size > 12 * 1024 * 1024) {
      alert("Ukuran gambar terlalu besar (maks 12MB). Coba gambar lain.");
      return;
    }

    setUploadingCardIcon(target);
    try {
      const compressed = await compressIconImage(file);
      const uploadedUrl = await uploadToCloudinaryWithProgress(
        compressed,
        () => {}
      );
      if (target === "review") setReviewCardIconUrl(uploadedUrl);
      else setComplaintCardIconUrl(uploadedUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mengupload ikon.");
    } finally {
      setUploadingCardIcon(null);
      setCardIconTarget(null);
    }
  }

  function handleAddSocialLink() {
    setSocialLinks((prev) => [
      ...prev,
      { id: newSocialLinkId(), platform: "instagram", label: null, url: "" },
    ]);
  }

  function handleRemoveSocialLink(id: string) {
    // File ikon lama dibersihkan server SETELAH Simpan berhasil
    // (lihat updateSettings), bukan di sini.
    setSocialLinks((prev) => prev.filter((link) => link.id !== id));
  }

  function handleSocialLinkPlatformChange(id: string, platform: SocialPlatform) {
    setSocialLinks((prev) =>
      prev.map((link) => (link.id === id ? { ...link, platform } : link))
    );
  }

  // Owner memaksa tautan ini tampil di kelompok "main" (pill di atas)
  // atau "icon" (baris ikon di bawah), menimpa default bawaan platform.
  function handleSocialLinkGroupChange(
    id: string,
    group: "main" | "icon"
  ) {
    setSocialLinks((prev) =>
      prev.map((link) =>
        link.id === id ? { ...link, display_group: group } : link
      )
    );
  }

  function handleSocialLinkUrlChange(id: string, url: string) {
    setSocialLinks((prev) =>
      prev.map((link) => (link.id === id ? { ...link, url } : link))
    );
  }

  function handleSocialLinkLabelChange(id: string, label: string) {
    setSocialLinks((prev) =>
      prev.map((link) => (link.id === id ? { ...link, label } : link))
    );
  }

  // Upload ikon custom (opsional) per tautan. Beda dari Logo/Cover di
  // atas yang uploadnya DITUNDA sampai klik "Simpan Pengaturan" - ikon
  // di sini langsung diupload begitu dipilih (kayak ganti foto profil
  // di app chat), supaya owner langsung lihat hasilnya di chip-nya
  // tanpa perlu nunggu submit form dulu. Baris mana yang lagi diupload
  // dilacak lewat uploadingIconId - dipakai buat nampilin spinner di
  // chip yang tepat.
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  const [iconUploadTargetId, setIconUploadTargetId] = useState<string | null>(
    null
  );
  const [uploadingIconId, setUploadingIconId] = useState<string | null>(null);

  function triggerIconUpload(id: string) {
    setIconUploadTargetId(id);
    iconFileInputRef.current?.click();
  }

  async function handleIconFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const targetId = iconUploadTargetId;
    // Reset input-nya supaya file yang SAMA bisa dipilih lagi nanti
    // (browser tidak trigger onChange kalau value-nya tidak berubah).
    e.target.value = "";
    if (!file || !targetId) return;

    // Tolak file yang KELEWAT besar sebelum masuk proses kompresi -
    // gambar sebesar ini (foto asli kamera dsb) cuma bikin browser
    // lama di step kompresi tanpa manfaat, karena hasil akhirnya toh
    // akan di-downscale jadi ikon kecil juga.
    if (file.size > 12 * 1024 * 1024) {
      alert("Ukuran gambar terlalu besar (maks 12MB). Coba gambar lain.");
      return;
    }

    setUploadingIconId(targetId);
    try {
      // compressIconImage (bukan compressComplaintPhoto) - khusus
      // dibuat sangat kecil (~30KB, 240px) karena cuma dipakai sebagai
      // bubble ikon, bukan foto besar. Lihat lib/utils.ts.
      const compressed = await compressIconImage(file);
      const uploadedUrl = await uploadToCloudinaryWithProgress(
        compressed,
        () => {}
      );
      setSocialLinks((prev) =>
        prev.map((link) =>
          link.id === targetId ? { ...link, icon_url: uploadedUrl } : link
        )
      );
      // Ikon lama yang diganti dibersihkan server setelah Simpan berhasil
      // (lihat updateSettings).
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Gagal mengupload ikon custom."
      );
    } finally {
      setUploadingIconId(null);
      setIconUploadTargetId(null);
    }
  }

  function handleRemoveCustomIcon(id: string) {
    const link = socialLinks.find((l) => l.id === id);
    if (!link?.icon_url) return;
    setSocialLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, icon_url: null } : l))
    );
  }

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
        ownerWhatsapp: String(
          // Basic: field ini tidak dirender, jadi form.get() selalu null.
          // Pakai nilai LAMA sebagai fallback (bukan string kosong),
          // supaya kalau kartu ini sebelumnya sempat Pro dan sudah
          // ada nomor WA tersimpan, nomor itu tidak ikut ke-reset
          // cuma gara-gara owner menyimpan Nama Toko/Link Review.
          form.get("ownerWhatsapp") ?? product.owner_whatsapp ?? ""
        ),
        logoUrl: uploadedLogoUrl,
        coverImageUrl: uploadedCoverUrl,
        // Dikirim tiap kali ADA foto sampul aktif (baru ataupun yang
        // lama) - supaya geser posisi TANPA ganti foto pun tetap
        // kesimpen.
        coverPosition: coverPreview ? `${coverPosX}% ${coverPosY}%` : undefined,
        brandColor,
        socialLinks,
        // Hanya Pro yang punya bagian ini; di Basic jangan menimpa nilai lama.
        connectTitle: isPro ? connectTitle : undefined,
        connectDescription: isPro ? connectDescription : undefined,
        // Dua kartu pilihan (Pro). String kosong = kembali ke bawaan;
        // undefined (Basic) = jangan menimpa nilai lama.
        reviewCardTitle: isPro ? reviewCardTitle : undefined,
        reviewCardDescription: isPro ? reviewCardDescription : undefined,
        reviewCardIconUrl: isPro ? (reviewCardIconUrl ?? "") : undefined,
        complaintCardTitle: isPro ? complaintCardTitle : undefined,
        complaintCardDescription: isPro ? complaintCardDescription : undefined,
        complaintCardIconUrl: isPro ? (complaintCardIconUrl ?? "") : undefined,
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

      {/* Preview instan halaman feedback pelanggan - link RELATIF ke
          /r/[shortCode] (URL yang sama persis dengan yang dibuka
          pelanggan lewat QR code), jadi owner tidak perlu scan QR
          cuma buat lihat/tes halamannya sendiri. target="_blank" biar
          dashboard-nya tidak ikut ke-tinggal. */}
      {/* Paket Basic tidak punya halaman feedback custom - link ini
          cuma bikin bingung kalau ditampilkan (hasilnya cuma redirect
          instan ke Google Review, bukan halaman apa-apa buat dilihat). */}
      {isPro && (
        <a
          href={`/r/${product.short_code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-3 rounded-xl border border-black/[0.06] bg-[#F6F8F7] p-3 transition-colors duration-200 hover:border-[var(--brand)]/30 hover:bg-[var(--brand)]/[0.05]"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-transform duration-200 group-hover:scale-105"
            style={{
              background: "linear-gradient(135deg, var(--brand), var(--brand-dark))",
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[#132320]">
              Lihat Halaman Feedback
            </span>
            <span className="block text-[11px] text-[#132320]/50">
              Buka tampilan yang dilihat pelanggan - tanpa perlu scan QR
            </span>
          </span>
        </a>
      )}

      <div className="space-y-5 border-t border-black/[0.06] pt-5">
        {/* Logo tadinya tetap tampil buat semua plan karena juga
            dipakai di sidebar dashboard (lihat store-context.tsx) -
            tapi sesuai keputusan terbaru, Basic disederhanakan jadi
            CUMA Nama Toko + Link Google Review. Sidebar Basic jadi
            pakai ikon default, bukan logo custom - itu trade-off yang
            disengaja, bukan bug. */}
        {isPro && (
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
        )}

        {/* Foto Sampul - beda dari Logo: ini gambar LEBAR (landscape),
            tampil sebagai banner di paling atas halaman feedback
            pelanggan. Kalau tidak diisi, halaman feedback tetap tampil
            rapi seperti biasa (tidak ada bagian yang kosong/rusak). */}
        {/* Cuma dipakai sebagai banner di halaman feedback custom -
            tidak relevan buat Basic yang pelanggannya langsung
            di-redirect ke Google Review, tidak pernah lihat halaman ini. */}
        {isPro && (
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
        )}

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

        {isPro && (
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
        )}

        {isPro && (
        <div>
          <Label>Warna Tema</Label>
          <p className="mt-1 text-xs text-[#132320]/45">
            Dipakai untuk warna aksen di dashboard kamu dan tombol &quot;Tulis
            Review di Google Maps&quot; di halaman feedback pelanggan.
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
        )}

        {/* Dua kartu pilihan di halaman feedback pelanggan: ikon, judul, dan
            keterangannya bisa diganti owner. Kosong = tampilan bawaan.
            Hanya Pro (Basic tidak punya halaman feedback sendiri). */}
        {isPro && (
        <div className="border-t border-black/[0.06] pt-5">
          <Label className="gap-1.5">
            <Pencil className="h-3.5 w-3.5 text-[#132320]/40" />
            Kartu di Halaman Feedback (Opsional)
          </Label>
          <p className="mt-1 text-xs text-[#132320]/45">
            Ini dua kartu pilihan yang dilihat pelanggan setelah scan. Ganti
            ikon dan tulisannya sesuai usahamu - klik ikon di kiri untuk
            pakai gambar sendiri. Kosongkan untuk memakai tampilan bawaan
            (teks abu-abu di kolom adalah teks bawaannya).
          </p>

          <input
            ref={cardIconInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCardIconSelected}
          />

          <div className="mt-3 space-y-2.5">
            <CardCustomizer
              heading="Kartu Review (Google Maps)"
              accent={brandColor}
              defaults={REVIEW_CARD_DEFAULT}
              defaultIcon={<MapPin className="h-5 w-5" />}
              title={reviewCardTitle}
              description={reviewCardDescription}
              iconUrl={reviewCardIconUrl}
              uploading={uploadingCardIcon === "review"}
              onTitle={setReviewCardTitle}
              onDescription={setReviewCardDescription}
              onPickIcon={() => triggerCardIconUpload("review")}
              onClearIcon={() => setReviewCardIconUrl(null)}
              onReset={() => {
                setReviewCardTitle("");
                setReviewCardDescription("");
                setReviewCardIconUrl(null);
              }}
            />
            <CardCustomizer
              heading="Kartu Layanan Pelanggan"
              accent="#2F7D5B"
              defaults={COMPLAINT_CARD_DEFAULT}
              defaultIcon={<MessageSquareCheck className="h-5 w-5" />}
              title={complaintCardTitle}
              description={complaintCardDescription}
              iconUrl={complaintCardIconUrl}
              uploading={uploadingCardIcon === "complaint"}
              onTitle={setComplaintCardTitle}
              onDescription={setComplaintCardDescription}
              onPickIcon={() => triggerCardIconUpload("complaint")}
              onClearIcon={() => setComplaintCardIconUrl(null)}
              onReset={() => {
                setComplaintCardTitle("");
                setComplaintCardDescription("");
                setComplaintCardIconUrl(null);
              }}
            />
          </div>
        </div>
        )}

        {/* Connect with Us - daftar tautan (Instagram, Website, Katalog,
            TikTok, Shopee, dst) yang muncul di halaman feedback
            pelanggan sebagai bagian "Terhubung dengan Kami" - collapsible,
            baru terbuka ke bawah kalau pelanggan klik. Kosongkan section
            ini (hapus semua baris) kalau tidak mau bagian itu muncul
            sama sekali di halaman pelanggan. */}
        {/* Cuma muncul di halaman feedback custom - tidak relevan
            buat Basic (lihat catatan isPro di komentar props atas). */}
        {isPro && (
        <div className="border-t border-black/[0.06] pt-5">
          <Label className="gap-1.5">
            <Share2 className="h-3.5 w-3.5 text-[#132320]/40" />
            Connect with Us (Opsional)
          </Label>
          <p className="mt-1 text-xs text-[#132320]/45">
            Tautan ini muncul sebagai bagian &quot;Terhubung dengan
            Kami&quot; di halaman feedback pelanggan - baru terbuka ke
            bawah waktu pelanggan mengetuknya. Defaultnya Website/
            Katalog/Shopee dkk jadi tombol panjang di atas, akun sosial
            (Instagram/TikTok/dst) jadi ikon kecil di bawahnya - tapi
            bisa kamu ubah manual sendiri lewat tombol &quot;Tombol di
            atas&quot; / &quot;Ikon di bawah&quot; di tiap tautan. Klik
            ikon di kiri tiap tautan kalau mau pakai gambar/logo
            sendiri, bukan ikon bawaan.
          </p>

          {/* Teks tombol yang dilihat pelanggan - bebas diketik sendiri
              supaya cocok dengan jenis usaha (hotel, salon, toko, dst). */}
          <div className="mt-3 space-y-2.5 rounded-xl border border-black/[0.07] bg-white p-3">
            <div>
              <Label htmlFor="connectTitle" className="text-xs">
                Judul tombol
              </Label>
              <Input
                id="connectTitle"
                value={connectTitle}
                onChange={(e) => setConnectTitle(e.target.value)}
                maxLength={60}
                placeholder="Terhubung dengan Kami"
                className="mt-1 h-11 bg-white text-sm"
              />
            </div>
            <div>
              <Label htmlFor="connectDescription" className="text-xs">
                Keterangan singkat
              </Label>
              <Input
                id="connectDescription"
                value={connectDescription}
                onChange={(e) => setConnectDescription(e.target.value)}
                maxLength={140}
                placeholder="Katalog, website, media sosial, dan tautan lainnya dari kami."
                className="mt-1 h-11 bg-white text-sm"
              />
              <p className="mt-1 text-[11px] text-[#132320]/45">
                Contoh hotel: &quot;Info Kamar &amp; Fasilitas&quot; /
                &quot;Lihat tipe kamar, fasilitas, dan promo menginap.&quot;
                Kosongkan untuk memakai teks bawaan.
              </p>
            </div>
          </div>

          <input
            ref={iconFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleIconFileSelected}
          />

          <div className="mt-3 space-y-2.5">
            {socialLinks.map((link) => {
              const meta = SOCIAL_PLATFORM_META[link.platform];
              const Icon = meta.icon;
              return (
                <div
                  key={link.id}
                  className="group space-y-2 rounded-xl border border-black/[0.07] bg-[#F6F8F7] p-3 transition-colors duration-200 hover:border-black/[0.12]"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => triggerIconUpload(link.id)}
                      title="Klik untuk pakai ikon sendiri"
                      disabled={uploadingIconId === link.id}
                      className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-black/[0.06] transition-colors duration-200"
                      style={
                        !link.icon_url
                          ? {
                              backgroundColor: `color-mix(in srgb, ${meta.color} 14%, white)`,
                              color: meta.color,
                            }
                          : { backgroundColor: "white" }
                      }
                    >
                      {uploadingIconId === link.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#132320]/50" />
                      ) : link.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cloudinaryThumbnail(link.icon_url, "f_auto,q_auto,w_88")}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Icon className="h-4.5 w-4.5" />
                      )}

                      {/* Overlay ikon pensil - hint kalau chip ini bisa
                          diklik untuk pakai ikon sendiri. */}
                      {uploadingIconId !== link.id && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-150 group-hover:bg-black/40 group-hover:opacity-100">
                          <Pencil className="h-3.5 w-3.5 text-white" />
                        </span>
                      )}
                    </button>

                    {link.icon_url && uploadingIconId !== link.id && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomIcon(link.id)}
                        title="Pakai ikon default lagi"
                        className="flex h-11 w-6 shrink-0 items-center justify-center text-[#132320]/30 transition hover:text-[#B5585E]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <select
                      value={link.platform}
                      onChange={(e) =>
                        handleSocialLinkPlatformChange(
                          link.id,
                          e.target.value as SocialPlatform
                        )
                      }
                      className="h-11 flex-1 rounded-lg border border-black/[0.1] bg-white px-2.5 text-sm text-[#132320] transition-colors duration-200 focus:border-[var(--brand)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/15"
                    >
                      {SOCIAL_PLATFORM_ORDER.map((platform) => (
                        <option key={platform} value={platform}>
                          {SOCIAL_PLATFORM_META[platform].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveSocialLink(link.id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#132320]/40 transition hover:bg-black/[0.05] hover:text-[#B5585E]"
                      title="Hapus tautan ini"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Owner bisa PAKSA tautan ini tampil di kelompok mana
                      pun - defaultnya sudah ditentukan otomatis sesuai
                      platform, tapi tombol ini bisa menimpanya. */}
                  {(() => {
                    const group = resolveDisplayGroup(link);
                    return (
                      <div className="flex items-center gap-1.5 pl-0.5">
                        <span className="text-[11px] text-[#132320]/40">
                          Tampil sebagai:
                        </span>
                        <div className="flex overflow-hidden rounded-md border border-black/[0.1]">
                          <button
                            type="button"
                            onClick={() =>
                              handleSocialLinkGroupChange(link.id, "main")
                            }
                            className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                              group === "main"
                                ? "bg-[var(--brand)] text-white"
                                : "bg-white text-[#132320]/50 hover:bg-black/[0.03]"
                            }`}
                          >
                            Tombol di atas
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleSocialLinkGroupChange(link.id, "icon")
                            }
                            className={`border-l border-black/[0.1] px-2 py-1 text-[11px] font-medium transition-colors ${
                              group === "icon"
                                ? "bg-[var(--brand)] text-white"
                                : "bg-white text-[#132320]/50 hover:bg-black/[0.03]"
                            }`}
                          >
                            Ikon di bawah
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {link.platform === "other" && (
                    <Input
                      value={link.label ?? ""}
                      onChange={(e) =>
                        handleSocialLinkLabelChange(link.id, e.target.value)
                      }
                      placeholder="Nama tautan (mis. Linktree, Marketplace lain)"
                      className="h-11 bg-white text-sm"
                    />
                  )}

                  <Input
                    value={link.url}
                    onChange={(e) =>
                      handleSocialLinkUrlChange(link.id, e.target.value)
                    }
                    placeholder={meta.placeholder}
                    className="h-11 bg-white text-sm"
                  />
                </div>
              );
            })}

            {socialLinks.length === 0 && (
              <p className="rounded-xl border border-dashed border-black/[0.12] px-3.5 py-3 text-xs text-[#132320]/40">
                Belum ada tautan. Tambahkan Instagram, Website, Katalog,
                TikTok, Shopee, atau lainnya lewat tombol di bawah.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={handleAddSocialLink}
              className="h-11 w-full gap-1.5 text-sm"
            >
              <Plus className="h-4 w-4" />
              Tambah Tautan
            </Button>
          </div>
        </div>
        )}

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
