// lib/supabase/server.ts
// Dipakai di Server Component / Server Action / Route Handler.
// Jangan import file ini di client component.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client biasa (ikut RLS, ikut sesi login user).
 * Pakai ini untuk: baca data dashboard owner, cek auth, dll.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Diabaikan kalau dipanggil dari Server Component murni
            // (tidak bisa set cookie di sana, hanya di Server Action/Route Handler).
          }
        },
      },
    }
  );
}

/**
 * Client dengan SERVICE ROLE KEY — BYPASS SEMUA RLS.
 * HANYA dipakai untuk operasi yang memang butuh akses penuh:
 * - Baca data produk publik by short_code sebelum user login (halaman /r/[uid])
 * - Verifikasi PIN aktivasi
 * - Aksi Super Admin (suspend, override, generate batch QR)
 * - Generate signed URL foto keluhan
 *
 * JANGAN PERNAH import file ini di Client Component.
 * JANGAN PERNAH kirim hasil query mentah dari sini langsung ke browser
 * tanpa filter kolom (misal jangan kirim pin_hash ke client).
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
