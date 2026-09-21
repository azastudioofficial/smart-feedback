// app/api/cron/cleanup/route.ts
// Endpoint pembersihan otomatis: hapus keluhan (+ foto Cloudinary-nya)
// yang usianya lebih dari 30 hari. Dipanggil oleh layanan cron
// eksternal (misal cron-job.org) secara berkala, BUKAN oleh pengguna.
//
// Cara panggil:
//   GET https://domainmu.com/api/cron/cleanup?token=RAHASIA
//   atau header: Authorization: Bearer RAHASIA

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { extractCloudinaryPublicId } from "@/lib/utils";

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

/**
 * Ambil public_id Cloudinary dari secure_url yang tersimpan.
 * Contoh input:
 *   https://res.cloudinary.com/xxx/image/upload/v123456/complaint-photos/abc.webp
 * Contoh output:
 *   complaint-photos/abc
 */

/**
 * Hapus banyak foto sekaligus dari Cloudinary lewat Admin API.
 * Beda dengan upload (unsigned, dari browser), operasi hapus ini
 * WAJIB dari server dan pakai API Key + API Secret (rahasia).
 */
async function deleteFromCloudinary(
  publicIds: string[]
): Promise<{ deleted: string[]; errors: string[] }> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Konfigurasi Cloudinary Admin API belum lengkap.");
  }

  const auth = btoa(`${apiKey}:${apiSecret}`);
  const deleted: string[] = [];
  const errors: string[] = [];

  // Cloudinary batasi jumlah public_ids per request - aman dibatch 100.
  const chunkSize = 100;
  for (let i = 0; i < publicIds.length; i += chunkSize) {
    const chunk = publicIds.slice(i, i + chunkSize);
    const params = new URLSearchParams();
    chunk.forEach((id) => params.append("public_ids[]", id));

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params.toString()}`,
      {
        method: "DELETE",
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      errors.push(`Batch gagal (${response.status}): ${text}`);
      continue;
    }

    const result = await response.json();
    const deletedInBatch = Object.keys(result.deleted ?? {}).filter(
      (id) => result.deleted[id] === "deleted"
    );
    deleted.push(...deletedInBatch);
  }

  return { deleted, errors };
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
  const headerToken = authHeader?.replace(/^Bearer\s+/i, "");
  const queryToken = request.nextUrl.searchParams.get("token");
  const providedToken = headerToken || queryToken;

  if (providedToken !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Ambil semua keluhan yang usianya > 30 hari
  const service = createServiceClient();
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: oldFeedbacks, error: fetchError } = await service
    .from("feedbacks")
    .select("id, photo_url")
    .lt("created_at", cutoff);

  if (fetchError) {
    return NextResponse.json(
      { error: "Gagal ambil data: " + fetchError.message },
      { status: 500 }
    );
  }

  if (!oldFeedbacks || oldFeedbacks.length === 0) {
    const rawLogsResult = await cleanupRawLogs(service);

    await logCronRun(service, {
      ran_at: new Date().toISOString(),
      deleted_rows: 0,
      photos_deleted: 0,
      ...rawLogsResult,
      status: "ok",
    });
    return NextResponse.json({
      message: "Tidak ada keluhan lama, tapi scan_logs/positive_clicks lama tetap dibersihkan.",
      deleted_rows: 0,
      photos_deleted: 0,
      ...rawLogsResult,
    });
  }

  // 3. Hapus foto dari Cloudinary dulu (kalau ada)
  const publicIds = oldFeedbacks
    .map((f) => (f.photo_url ? extractCloudinaryPublicId(f.photo_url) : null))
    .filter((id): id is string => !!id);

  let cloudinaryResult: { deleted: string[]; errors: string[] } = {
    deleted: [],
    errors: [],
  };

  if (publicIds.length > 0) {
    try {
      cloudinaryResult = await deleteFromCloudinary(publicIds);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Gagal hapus foto Cloudinary.",
        },
        { status: 500 }
      );
    }
  }

  // 4. BARU hapus baris data dari Supabase, setelah foto beres dihapus
  const idsToDelete = oldFeedbacks.map((f) => f.id);
  const { error: deleteError } = await service
    .from("feedbacks")
    .delete()
    .in("id", idsToDelete);

  if (deleteError) {
    return NextResponse.json(
      {
        error:
          "Foto sudah dihapus, tapi gagal hapus baris data: " +
          deleteError.message,
        photos_deleted: cloudinaryResult.deleted.length,
      },
      { status: 500 }
    );
  }

  const rawLogsResult = await cleanupRawLogs(service);

  await logCronRun(service, {
    ran_at: new Date().toISOString(),
    deleted_rows: idsToDelete.length,
    photos_deleted: cloudinaryResult.deleted.length,
    photo_errors: cloudinaryResult.errors,
    ...rawLogsResult,
    status: "ok",
  });

  return NextResponse.json({
    message: "Pembersihan selesai.",
    deleted_rows: idsToDelete.length,
    photos_deleted: cloudinaryResult.deleted.length,
    photo_errors: cloudinaryResult.errors,
    ...rawLogsResult,
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
