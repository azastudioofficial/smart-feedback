// middleware.ts
// Lihat lib/supabase/middleware.ts untuk penjelasan kenapa file ini
// wajib ada (soal refresh token sesi login yang tidak bisa dilakukan
// dari Server Component biasa).

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Jalan di semua path KECUALI:
     * - file statis (_next/static, _next/image, favicon, gambar, dll)
     * - route API & cron (tidak butuh sesi browser)
     * Halaman publik (feedback, aktivasi, dll) tetap kena middleware
     * ini juga - tidak masalah, cuma menambah 1 pengecekan ringan,
     * dan tetap dibutuhkan supaya link "sudah login? lempar ke
     * dashboard" & sebagainya konsisten di seluruh situs.
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
  ],
};
