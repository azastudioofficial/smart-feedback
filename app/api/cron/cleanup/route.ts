// app/api/cron/cleanup/route.ts
// Endpoint pembersihan otomatis: hapus keluhan (+ foto Cloudinary-nya)
// yang usianya lebih dari 30 hari. Dipanggil oleh Cloudflare Cron
// Trigger (lihat custom-worker.ts), BUKAN oleh pengguna.
//
// Cara panggil manual (untuk tes):
//   curl -H "Authorization: Bearer RAHASIA" https://domainmu.com/api/cron/cleanup
//
// Token hanya diterima lewat header Authorization - TIDAK lagi lewat
// ?token= di URL, karena URL bisa tercatat di log/riwayat browser.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { publicIdsFromUrls, purgeAssets, retryPendingCleanups, type ProductAssets } from "@/lib/asset-cleanup";

const RETENTION_DAYS = 30; // untuk feedbacks (keluhan + foto)
const RAW_LOGS_RETENTION_DAYS = 90; // untuk scan_logs & positive_clicks

/**
 * Bersihkan scan_logs & positive_clicks yang lebih tua dari
 * RAW_LOGS_RETENTION_DAYS. Beda dengan feedbacks, data ini tidak
 * ada foto yang perlu dihapus dulu - jadi cukup 1 query delete.
 * Retention lebih panjang (90 hari) karena ini cuma data analitik
 * "jumlah", bukan isi keluhan yang sensitif.
 */
async function cleanupRawLogs(
  service: ReturnType<typeof createServiceClient>
): Promise<{ scan_logs_deleted: number; positive_clicks_deleted: number }> {
  const cutoff = new Date(
    Date.now() - RAW_LOGS_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { count: scanLogsDeleted } = await service
    .from("scan_logs")
    .delete({ count: "exact" })
    .lt("scanned_at", cutoff);

  const { count: positiveClicksDeleted } = await service
    .from("positive_clicks")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);

  return {
    scan_logs_deleted: scanLogsDeleted ?? 0,
    positive_clicks_deleted: positiveClicksDeleted ?? 0,
  };
}

async function logCronRun(
  service: ReturnType<typeof createServiceClient>,
  detail: Record<string, unknown>
) {
  await service.from("admin_actions").insert({
    actor_id: null,
    product_id: null,
    action: "cron_cleanup_run",
    detail,
  });
}

/** Bandingkan token tanpa bocor lewat selisih waktu (timing attack). */
function tokensMatch(provided: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  // Panjang beda -> tetap jalankan loop supaya waktunya tidak informatif.
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function handleCleanup(request: NextRequest) {
  // 1. Verifikasi secret token - WAJIB, supaya endpoint ini tidak bisa
  //    dipanggil sembarang orang untuk menghapus data secara massal.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET belum diset di environment variables." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const providedToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (!providedToken || !tokensMatch(providedToken, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Ambil semua keluhan yang usianya > 30 hari
  const service = createServiceClient();
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: oldFeedbacks, error: fetchError } = await service
    .from("feedbacks")
    .select("id, photo_url, photo_path")
    .lt("created_at", cutoff);

  if (fetchError) {
    return NextResponse.json(
      { error: "Gagal ambil data: " + fetchError.message },
      { status: 500 }
    );
  }

  // 3. Hapus foto dulu (Cloudinary + Storage lama). Hasilnya dicek PER
  //    KELUHAN: baris yang fotonya gagal dihapus TIDAK ikut dihapus,
  //    jadi tetap ada petunjuk untuk dicoba lagi besok - tidak jadi
  //    file yatim di Cloudinary.
  const rows = (oldFeedbacks ?? []).map((f) => ({
    id: f.id as string,
    cloudinaryIds: publicIdsFromUrls([f.photo_url]),
    storage: f.photo_path
      ? [{ bucket: "complaint-photos", path: f.photo_path as string }]
      : [],
  }));

  const allAssets: ProductAssets = {
    cloudinaryIds: [...new Set(rows.flatMap((r) => r.cloudinaryIds))],
    storage: rows.flatMap((r) => r.storage),
  };

  const { failed, errors: photoErrors } = await purgeAssets(service, allAssets);
  const failedCloud = new Set(failed.cloudinaryIds);
  const failedStorage = new Set(failed.storage.map((s) => `${s.bucket}/${s.path}`));

  const deletableIds = rows
    .filter(
      (r) =>
        !r.cloudinaryIds.some((id) => failedCloud.has(id)) &&
        !r.storage.some((s) => failedStorage.has(`${s.bucket}/${s.path}`))
    )
    .map((r) => r.id);
  const skippedRows = rows.length - deletableIds.length;
  const photosDeleted = allAssets.cloudinaryIds.length - failed.cloudinaryIds.length;

  // 4. BARU hapus baris data dari Supabase, hanya yang fotonya sudah beres
  //    (dipecah per 100 id supaya URL query tidak kepanjangan).
  for (let i = 0; i < deletableIds.length; i += 100) {
    const { error: deleteError } = await service
      .from("feedbacks")
      .delete()
      .in("id", deletableIds.slice(i, i + 100));

    if (deleteError) {
      return NextResponse.json(
        {
          error:
            "Foto sudah dihapus, tapi gagal hapus baris data: " +
            deleteError.message,
          photos_deleted: photosDeleted,
        },
        { status: 500 }
      );
    }
  }

  // 5. Bersihkan log mentah + coba lagi aset yatim dari hapus kartu
  //    sebelumnya yang sempat gagal.
  const rawLogsResult = await cleanupRawLogs(service);
  const retry = await retryPendingCleanups(service);

  const summary = {
    ran_at: new Date().toISOString(),
    deleted_rows: deletableIds.length,
    skipped_rows: skippedRows,
    photos_deleted: photosDeleted,
    photo_errors: photoErrors,
    orphan_retry: retry,
    ...rawLogsResult,
    status: skippedRows > 0 || retry.still_pending > 0 ? "partial" : "ok",
  };

  await logCronRun(service, summary);

  return NextResponse.json({
    message:
      rows.length === 0
        ? "Tidak ada keluhan lama, tapi log lama tetap dibersihkan."
        : "Pembersihan selesai.",
    ...summary,
  });
}

// Dukung GET (kebanyakan layanan cron gratis cuma bisa ping URL biasa)
// dan POST (kalau layanan cron-nya support custom method).
export async function GET(request: NextRequest) {
  return handleCleanup(request);
}

export async function POST(request: NextRequest) {
  return handleCleanup(request);
}
