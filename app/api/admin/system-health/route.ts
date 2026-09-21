// app/api/admin/system-health/route.ts
// Endpoint internal, HANYA bisa diakses akun super_admin yang sedang
// login (beda dengan /api/cron/cleanup yang pakai token, karena ini
// dipanggil dari dalam dashboard admin, bukan dari layanan luar).

export const runtime = "edge";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const DB_FREE_LIMIT_MB = 500; // batas free tier Supabase saat ini
const CRON_EXPECTED_INTERVAL_HOURS = 36; // toleransi keterlambatan cron harian

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 1. Kuota Cloudinary (Usage API resmi mereka)
  let cloudinary: {
    credits_used: number;
    credits_limit: number;
    credits_percent: number;
    storage_mb: number;
    bandwidth_mb: number;
  } | null = null;

  try {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      const auth = btoa(`${apiKey}:${apiSecret}`);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/usage`,
        { headers: { Authorization: `Basic ${auth}` } }
      );

      if (res.ok) {
        const data = await res.json();
        cloudinary = {
          credits_used: Math.round((data.credits?.usage ?? 0) * 100) / 100,
          credits_limit: data.credits?.limit ?? 25,
          credits_percent:
            Math.round((data.credits?.used_percent ?? 0) * 10) / 10,
          storage_mb: Math.round((data.storage?.usage ?? 0) / 1024 / 1024),
          bandwidth_mb: Math.round(
            (data.bandwidth?.usage ?? 0) / 1024 / 1024
          ),
        };
      }
    }
  } catch (err) {
    console.error("Gagal ambil usage Cloudinary:", err);
  }

  // 2. Ukuran database Postgres (langsung dari Postgres, akurat real-time)
  let database: {
    used_mb: number;
    limit_mb: number;
    percent: number;
  } | null = null;

  try {
    const { data: dbSizeBytes, error } = await supabase.rpc("admin_db_size");
    if (!error && typeof dbSizeBytes === "number") {
      const usedMb = dbSizeBytes / 1024 / 1024;
      database = {
        used_mb: Math.round(usedMb * 10) / 10,
        limit_mb: DB_FREE_LIMIT_MB,
        percent: Math.round((usedMb / DB_FREE_LIMIT_MB) * 1000) / 10,
      };
    }
  } catch (err) {
    console.error("Gagal ambil ukuran database:", err);
  }

  // 3. Status cron cleanup terakhir (dicatat sendiri oleh
  //    /api/cron/cleanup tiap kali selesai jalan)
  let cron: {
    last_run_at: string | null;
    last_run_summary: unknown;
    status: "active" | "stale" | "never_run";
  } = { last_run_at: null, last_run_summary: null, status: "never_run" };

  const { data: lastRun } = await supabase
    .from("admin_actions")
    .select("created_at, detail")
    .eq("action", "cron_cleanup_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRun) {
    const hoursSince =
      (Date.now() - new Date(lastRun.created_at).getTime()) / 1000 / 60 / 60;
    cron = {
      last_run_at: lastRun.created_at,
      last_run_summary: lastRun.detail,
      status: hoursSince <= CRON_EXPECTED_INTERVAL_HOURS ? "active" : "stale",
    };
  }

  return NextResponse.json({ cloudinary, database, cron });
}
