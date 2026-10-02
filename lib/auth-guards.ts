// lib/auth-guards.ts
//
// Server action di Next.js = endpoint POST publik. Middleware cuma
// mengecek "sudah login atau belum", BUKAN role-nya - dan pelanggan
// bisa membuat akun lewat form aktivasi. Jadi setiap action yang
// sensitif WAJIB mengecek role sendiri di awal fungsi.
//
// Pemakaian:
//   const guard = await requireRole(["super_admin"]);
//   if (!guard.ok) return { success: false, error: guard.error };
//   // guard.supabase, guard.user, guard.role tersedia di sini

import { createServerSupabase } from "@/lib/supabase/server";

export type StaffRole = "super_admin" | "reseller";

export async function requireRole(allowed: StaffRole[]) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role as string | undefined;

  if (!user || !role || !allowed.includes(role as StaffRole)) {
    return { ok: false as const, error: "Akses ditolak." };
  }

  return { ok: true as const, supabase, user, role: role as StaffRole };
}
