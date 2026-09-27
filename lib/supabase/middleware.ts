// lib/supabase/middleware.ts
//
// Ini yang menutup celah "logout sendiri secara acak". Server Component
// TIDAK BISA menulis cookie (lihat komentar di lib/supabase/server.ts),
// jadi kalau access token di-refresh otomatis oleh Supabase saat
// getUser() dipanggil dari Server Component, token baru itu cuma hidup
// di memori sebentar lalu hilang - cookie browser tetap yang lama.
// middleware.ts adalah SATU-SATUNYA tempat yang dijamin jalan sebelum
// setiap request dan BISA menulis cookie balik ke response, jadi token
// yang sudah di-refresh benar-benar tersimpan.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // JANGAN diganti jadi getSession() - getUser() yang benar-benar
  // memvalidasi token ke server Supabase (bukan cuma baca cookie apa
  // adanya), sekaligus inilah yang memicu auto-refresh token kalau
  // sudah dekat kedaluwarsa.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage =
    path === "/login" ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password");
  const isProtectedPage =
    path.startsWith("/dashboard") ||
    path.startsWith("/admin") ||
    path.startsWith("/reseller");

  // Belum login tapi coba akses halaman yang butuh login -> lempar ke /login.
  if (!user && isProtectedPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Sudah login tapi buka /login lagi -> langsung ke dashboard saja.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
