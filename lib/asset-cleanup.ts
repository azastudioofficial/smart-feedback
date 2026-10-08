// lib/asset-cleanup.ts
// Pembersihan file (Cloudinary + Supabase Storage lama) yang dipakai
// bersama oleh:
//   - app/api/cron/cleanup/route.ts  (keluhan > 30 hari + coba ulang)
//   - app/admin/master/actions.ts    (Reset & Hapus kartu)
//
// HANYA untuk server (action / route handler): memakai API Secret
// Cloudinary dan service client Supabase. Jangan di-import dari
// komponen client.
//
// Prinsip: file SELALU ikut dibersihkan, dan kalau ada yang gagal,
// kegagalannya TIDAK diam-diam hilang - dicatat di tabel admin_actions
// (action = "asset_cleanup_pending") lalu dicoba lagi oleh cron harian.

import { createServiceClient } from "@/lib/supabase/server";
import { extractCloudinaryPublicId } from "@/lib/utils";
import { isAllowedCloudinaryUrl } from "@/lib/safe-url";

type Service = ReturnType<typeof createServiceClient>;

export type StorageRef = { bucket: string; path: string };

export type ProductAssets = {
  /** public_id Cloudinary (tanpa ekstensi), sudah unik. */
  cloudinaryIds: string[];
  /** File lama di Supabase Storage (sebelum pindah ke Cloudinary). */
  storage: StorageRef[];
};

const CLOUDINARY_HOST = "res.cloudinary.com";
const BATCH_SIZE = 100; // batas aman Cloudinary per request hapus
const PAGE_SIZE = 1000; // batas baris per query Supabase
const PENDING_ACTION = "asset_cleanup_pending";
const DONE_ACTION = "asset_cleanup_done";

export function emptyAssets(): ProductAssets {
  return { cloudinaryIds: [], storage: [] };
}

export function hasAssets(a: ProductAssets): boolean {
  return a.cloudinaryIds.length > 0 || a.storage.length > 0;
}

/** public_id dari daftar URL; URL non-Cloudinary dan duplikat dibuang. */
export function publicIdsFromUrls(
  urls: Array<string | null | undefined>
): string[] {
  const ids = new Set<string>();
  for (const url of urls) {
    // Hanya URL Cloudinary MILIK KITA (cloud name dicek) - URL palsu yang
    // menyelipkan nama file toko lain tidak boleh ikut terhapus.
    if (!url || !isAllowedCloudinaryUrl(url)) continue;
    const id = extractCloudinaryPublicId(url);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Logo lama yang masih di bucket Supabase "business-logos". */
function legacyLogoRef(url: string | null | undefined): StorageRef | null {
  if (!url || url.includes(CLOUDINARY_HOST)) return null;
  const marker = "/business-logos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split("?")[0];
  return path ? { bucket: "business-logos", path } : null;
}

/**
 * Hapus banyak foto dari Cloudinary lewat Admin API (butuh API Key +
 * Secret, beda dari upload yang unsigned dari browser).
 * "not_found" dianggap beres - artinya fotonya memang sudah tidak ada.
 * Yang masuk `failed` = benar-benar gagal dan perlu dicoba lagi.
 */
export async function deleteCloudinaryImages(
  publicIds: string[]
): Promise<{ failed: string[]; errors: string[] }> {
  if (publicIds.length === 0) return { failed: [], errors: [] };

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      failed: [...publicIds],
      errors: ["Konfigurasi Cloudinary Admin API belum lengkap."],
    };
  }

  const auth = btoa(`${apiKey}:${apiSecret}`);
  const failed: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < publicIds.length; i += BATCH_SIZE) {
    const chunk = publicIds.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams();
    chunk.forEach((id) => params.append("public_ids[]", id));

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params.toString()}`,
        { method: "DELETE", headers: { Authorization: `Basic ${auth}` } }
      );

      if (!res.ok) {
        errors.push(`Batch gagal (${res.status}): ${await res.text()}`);
        failed.push(...chunk);
        continue;
      }

      const result = (await res.json()) as {
        deleted?: Record<string, string>;
      };
      for (const id of chunk) {
        const state = result.deleted?.[id];
        if (state !== "deleted" && state !== "not_found") failed.push(id);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Gagal menghubungi Cloudinary.");
      failed.push(...chunk);
    }
  }

  return { failed, errors };
}

/** Hapus file lama di Supabase Storage. File yang tidak ada dianggap beres. */
export async function deleteStorageFiles(
  service: Service,
  refs: StorageRef[]
): Promise<{ failed: StorageRef[]; errors: string[] }> {
  const failed: StorageRef[] = [];
  const errors: string[] = [];

  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of refs) {
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  }

  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const chunk = paths.slice(i, i + BATCH_SIZE);
      const { error } = await service.storage.from(bucket).remove(chunk);
      if (error) {
        errors.push(`Storage ${bucket}: ${error.message}`);
        failed.push(...chunk.map((path) => ({ bucket, path })));
      }
    }
  }

  return { failed, errors };
}

/** Hapus semua aset sekaligus; hasilnya = aset yang MASIH GAGAL dihapus. */
export async function purgeAssets(
  service: Service,
  assets: ProductAssets
): Promise<{ failed: ProductAssets; errors: string[] }> {
  const [cloud, storage] = await Promise.all([
    deleteCloudinaryImages(assets.cloudinaryIds),
    deleteStorageFiles(service, assets.storage),
  ]);
  return {
    failed: { cloudinaryIds: cloud.failed, storage: storage.failed },
    errors: [...cloud.errors, ...storage.errors],
  };
}

/**
 * Kumpulkan SEMUA file milik 1 kartu: logo, cover, ikon custom
 * "Connect with Us", dan foto semua keluhannya. Harus dipanggil
 * SEBELUM kartu dihapus / direset - setelah itu datanya sudah hilang
 * dan file di Cloudinary tidak ada lagi petunjuk untuk dicari.
 */
export async function collectProductAssets(
  service: Service,
  productId: string
): Promise<ProductAssets> {
  const { data: product } = await service
    .from("products")
    .select("logo_url, cover_image_url, social_links")
    .eq("id", productId)
    .maybeSingle();

  const urls: Array<string | null | undefined> = [
    product?.logo_url,
    product?.cover_image_url,
  ];
  const links = Array.isArray(product?.social_links) ? product.social_links : [];
  for (const link of links) {
    urls.push((link as { icon_url?: string | null } | null)?.icon_url);
  }

  // Ikon dua kartu pilihan (halaman feedback). Dibaca TERPISAH dan
  // gagal-aman: kalau kolomnya belum ada, pembersihan logo/cover/ikon lain
  // di atas tetap berjalan seperti biasa.
  const { data: cardIcons, error: cardIconsError } = await service
    .from("products")
    .select("review_card_icon_url, complaint_card_icon_url")
    .eq("id", productId)
    .maybeSingle();
  if (!cardIconsError) {
    urls.push(cardIcons?.review_card_icon_url, cardIcons?.complaint_card_icon_url);
  }

  const storage: StorageRef[] = [];
  const logoRef = legacyLogoRef(product?.logo_url);
  if (logoRef) storage.push(logoRef);

  // Foto keluhan - dibaca per halaman karena Supabase membatasi 1000
  // baris per query.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: rows } = await service
      .from("feedbacks")
      .select("photo_url, photo_path")
      .eq("product_id", productId)
      .range(from, from + PAGE_SIZE - 1);

    for (const row of rows ?? []) {
      urls.push(row.photo_url);
      if (row.photo_path) {
        storage.push({ bucket: "complaint-photos", path: row.photo_path });
      }
    }
    if (!rows || rows.length < PAGE_SIZE) break;
  }

  return { cloudinaryIds: publicIdsFromUrls(urls), storage };
}

/**
 * Catat aset yang gagal dihapus supaya TIDAK hilang dari radar.
 * Cron harian akan mencobanya lagi lewat retryPendingCleanups().
 */
export async function recordPendingCleanup(
  service: Service,
  context: string,
  failed: ProductAssets,
  errors: string[]
): Promise<void> {
  if (!hasAssets(failed)) return;
  const { error } = await service.from("admin_actions").insert({
    actor_id: null,
    product_id: null,
    action: PENDING_ACTION,
    detail: {
      context,
      cloudinary_ids: failed.cloudinaryIds,
      storage: failed.storage,
      errors: errors.slice(0, 5),
      noted_at: new Date().toISOString(),
    },
  });
  if (error) {
    // Jangan sampai gagal mencatat membuat operasi utama ikut gagal,
    // tapi jejaknya tetap harus ada di log server.
    console.error(
      `[asset-cleanup] gagal mencatat aset yatim (${context}):`,
      error.message,
      JSON.stringify(failed)
    );
  }
}

/**
 * Coba lagi aset yatim yang tercatat sebelumnya. Dipanggil cron.
 * Catatan yang sudah bersih ditandai "asset_cleanup_done"; yang masih
 * gagal tetap "pending" dengan sisa daftarnya.
 */
export async function retryPendingCleanups(
  service: Service
): Promise<{ retried: number; cleaned: number; still_pending: number }> {
  const { data: pending } = await service
    .from("admin_actions")
    .select("id, detail")
    .eq("action", PENDING_ACTION)
    .order("created_at", { ascending: true })
    .limit(50);

  let cleaned = 0;
  let stillPending = 0;

  for (const row of pending ?? []) {
    const detail = (row.detail ?? {}) as {
      cloudinary_ids?: string[];
      storage?: StorageRef[];
    };
    const assets: ProductAssets = {
      cloudinaryIds: detail.cloudinary_ids ?? [],
      storage: detail.storage ?? [],
    };

    const { failed, errors } = await purgeAssets(service, assets);

    if (!hasAssets(failed)) {
      cleaned++;
      await service
        .from("admin_actions")
        .update({
          action: DONE_ACTION,
          detail: { ...detail, cleaned_at: new Date().toISOString() },
        })
        .eq("id", row.id);
    } else {
      stillPending++;
      await service
        .from("admin_actions")
        .update({
          detail: {
            ...detail,
            cloudinary_ids: failed.cloudinaryIds,
            storage: failed.storage,
            errors: errors.slice(0, 5),
            last_retry_at: new Date().toISOString(),
          },
        })
        .eq("id", row.id);
    }
  }

  return {
    retried: pending?.length ?? 0,
    cleaned,
    still_pending: stillPending,
  };
}

/**
 * Hapus file Cloudinary berdasarkan URL-nya. Hasil Admin API DIPERIKSA, dan
 * file yang gagal dihapus (kunci API belum diisi, Cloudinary sedang error,
 * dll) dicatat ke admin_actions supaya cron harian mencobanya lagi - jadi
 * tidak ada file yang diam-diam menumpuk di Cloudinary.
 * Tidak pernah melempar error: operasi utama owner tidak boleh ikut gagal.
 */
export async function purgeCloudinaryUrls(
  urls: Array<string | null | undefined>,
  context: string
): Promise<void> {
  const ids = publicIdsFromUrls(urls);
  if (ids.length === 0) return;
  try {
    const service = createServiceClient();
    const { failed, errors } = await purgeAssets(service, {
      cloudinaryIds: ids,
      storage: [],
    });
    await recordPendingCleanup(service, context, failed, errors);
  } catch (err) {
    console.error(`[asset-cleanup] ${context}:`, err);
    try {
      await recordPendingCleanup(
        createServiceClient(),
        context,
        { cloudinaryIds: ids, storage: [] },
        [err instanceof Error ? err.message : "Gagal membersihkan file."]
      );
    } catch {
      // Sudah tercatat di log server di atas.
    }
  }
}

/**
 * true = URL ini masih dipakai di database (logo, sampul, ikon kartu, ikon
 * Connect with Us, atau foto keluhan) - ATAU pengecekan gagal. Gagal-aman:
 * kalau ragu, file dibiarkan.
 */
export async function urlStillReferenced(url: string): Promise<boolean> {
  const service = createServiceClient();
  for (const column of [
    "logo_url",
    "cover_image_url",
    "review_card_icon_url",
    "complaint_card_icon_url",
  ]) {
    const { data, error } = await service
      .from("products")
      .select("id")
      .eq(column, url)
      .limit(1);
    if (error) {
      console.error("Gagal cek pemakaian file:", error.message);
      return true;
    }
    if ((data?.length ?? 0) > 0) return true;
  }

  const { data: social, error: socialError } = await service
    .from("products")
    .select("id")
    .contains("social_links", [{ icon_url: url }])
    .limit(1);
  if (socialError) {
    console.error("Gagal cek pemakaian ikon:", socialError.message);
    return true;
  }
  if ((social?.length ?? 0) > 0) return true;

  const { data: photos, error: photoError } = await service
    .from("feedbacks")
    .select("id")
    .eq("photo_url", url)
    .limit(1);
  if (photoError) {
    console.error("Gagal cek pemakaian foto:", photoError.message);
    return true;
  }
  return (photos?.length ?? 0) > 0;
}

/**
 * true HANYA kalau file ini benar-benar baru diupload (maks 6 jam). Dipakai
 * supaya action pembuangan upload di bawah tidak bisa dipakai menghapus
 * file lama yang bukan upload owner (mis. gambar landing page).
 * Gagal-aman: kalau tidak bisa memastikan, hasilnya false.
 */
export async function isRecentCloudinaryUpload(url: string): Promise<boolean> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const publicId = extractCloudinaryPublicId(url);
  if (!cloudName || !apiKey || !apiSecret || !publicId) return false;

  try {
    const path = publicId.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${path}`,
      { headers: { Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` } }
    );
    if (!res.ok) return false;
    const info = (await res.json()) as { created_at?: string };
    const created = info.created_at ? Date.parse(info.created_at) : NaN;
    if (!Number.isFinite(created)) return false;
    return Date.now() - created < 6 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Buang 1 file yang baru diupload tapi TIDAK jadi dipakai (simpan gagal,
 * dibatalkan, diganti). Tiga pagar sekaligus, semuanya gagal-aman:
 *   1. URL harus Cloudinary milik kita,
 *   2. tidak boleh masih dipakai di database,
 *   3. file harus baru diupload (maks 6 jam) - gambar lama yang bukan
 *      upload pengguna tidak bisa dihapus lewat jalur ini.
 * Tidak pernah melempar error.
 */
export async function discardUnreferencedUpload(
  url: string,
  context: string
): Promise<void> {
  try {
    if (!isAllowedCloudinaryUrl(url)) return;
    if (await urlStillReferenced(url)) return;
    if (!(await isRecentCloudinaryUpload(url))) return;
    await purgeCloudinaryUrls([url], context);
  } catch (err) {
    console.error(`[asset-cleanup] ${context}:`, err);
  }
}
