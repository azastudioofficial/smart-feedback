"use server";
// app/admin/master/actions.ts

import { revalidatePath } from "next/cache";
import {
  createServerSupabase,
  createServiceClient,
} from "@/lib/supabase/server";

type ActionResult = { success: boolean; error?: string };

type GeneratedItem = { id: string; short_code: string };

type InventoryItem = {
  id: string;
  short_code: string;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  is_active: boolean;
  is_suspended: boolean;
  pending_review: boolean;
  reseller_name: string | null;
  created_at: string;
};

/**
 * Ambil 1 halaman kartu (25 per halaman) - dipakai bersama Admin &
 * Reseller. Pakai client yang IKUT SESI LOGIN, jadi RLS otomatis
 * membatasi: reseller cuma dapat kartu miliknya, admin dapat semua.
 * Ini menghindari narik SEMUA baris sekaligus saat data sudah banyak.
 */
export async function getInventoryPage(
  page: number,
  pageSize: number = 25
): Promise<{
  success: boolean;
  data?: InventoryItem[];
  totalCount?: number;
  error?: string;
}> {
  const supabase = await createServerSupabase();

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("products")
    .select(
      "id, short_code, business_name, google_review_url, owner_whatsapp, is_active, is_suspended, pending_review, created_at, resellers(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Gagal ambil halaman inventory:", error.message);
    return { success: false, error: error.message };
  }

  const items: InventoryItem[] = (data ?? []).map((p) => ({
    ...p,
    reseller_name:
      (p as unknown as { resellers?: { name: string } | null }).resellers
        ?.name ?? null,
  }));

  return { success: true, data: items, totalCount: count ?? 0 };
}

async function logAdminAction(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  productId: string,
  action: string,
  detail?: Record<string, unknown>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("admin_actions").insert({
    actor_id: user?.id,
    product_id: productId,
    action,
    detail: detail ?? null,
  });
}

/**
 * Generate N produk baru (short_code acak) lewat function khusus di
 * Postgres. Bisa langsung dialokasikan ke reseller tertentu (opsional).
 */
export async function generateProducts(
  count: number,
  prefix: string = "",
  resellerId: string | null = null
): Promise<{ success: boolean; data?: GeneratedItem[]; error?: string }> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("admin_generate_products", {
    p_count: count,
    p_prefix: prefix,
    p_reseller_id: resellerId,
  });

  if (error) {
    console.error("Gagal generate produk:", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/master");
  return { success: true, data: data ?? [] };
}

export async function toggleSuspend(
  productId: string,
  suspend: boolean
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("products")
    .update({ is_suspended: suspend })
    .eq("id", productId);

  if (error) {
    console.error("Gagal toggle suspend:", error.message);
    return { success: false, error: "Gagal mengubah status." };
  }

  await logAdminAction(supabase, productId, suspend ? "suspend" : "unsuspend");
  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true };
}

export async function overrideProduct(
  productId: string,
  data: {
    businessName: string;
    googleReviewUrl: string;
    ownerWhatsapp: string;
  }
): Promise<ActionResult> {
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("products")
    .update({
      business_name: data.businessName,
      google_review_url: data.googleReviewUrl,
      owner_whatsapp: data.ownerWhatsapp,
    })
    .eq("id", productId);

  if (error) {
    console.error("Gagal override produk:", error.message);
    return { success: false, error: "Gagal menyimpan perubahan." };
  }

  await logAdminAction(supabase, productId, "override_edit", data);
  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true };
}

/**
 * Kosongkan seluruh data toko - kartu siap dijual ulang. Sudah TIDAK
 * generate PIN lagi (sistem PIN sudah dihapus).
 *
 * FIX: RPC "admin_reset_product" di Postgres cuma nge-null-kan
 * owner_id di tabel products - dia TIDAK BISA menghapus akun
 * auth.users milik owner lama (SQL biasa tidak punya akses ke Admin
 * API Supabase Auth). Akibatnya sama seperti bug lama di
 * deleteProduct(): email owner lama "terjebak", tidak bisa dipakai
 * daftar ulang walau kartunya sudah dikosongkan. Solusinya BUKAN
 * mengubah SQL function-nya, tapi menambahkan langkah pembersihan
 * akun di sini (TypeScript), tepat setelah RPC-nya berhasil - sama
 * persis polanya dengan deleteProduct() di bawah.
 */
export async function resetAndUnbind(productId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const service = createServiceClient();

  // Ambil owner_id LAMA dulu, SEBELUM RPC menjalankan reset (RPC akan
  // mengosongkan owner_id ini jadi null).
  const { data: productRow } = await supabase
    .from("products")
    .select("owner_id")
    .eq("id", productId)
    .maybeSingle();

  const ownerId = (productRow as { owner_id: string | null } | null)
    ?.owner_id;

  const { error } = await supabase.rpc("admin_reset_product", {
    p_product_id: productId,
  });

  if (error) {
    console.error("Gagal reset produk:", error.message);
    return { success: false, error: error.message };
  }

  if (ownerId) {
    // Sama seperti di deleteProduct(): cek dulu apakah owner lama ini
    // masih terhubung ke toko LAIN sebelum akunnya ikut dihapus -
    // jaga-jaga data lama sebelum kebijakan 1 email = 1 toko berlaku.
    const { count } = await service
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);

    if (!count || count === 0) {
      const { error: authDeleteError } = await service.auth.admin.deleteUser(
        ownerId
      );
      if (authDeleteError) {
        console.error(
          "Produk sudah direset, tapi gagal menghapus akun login pemilik lamanya:",
          authDeleteError.message
        );
      }
    }
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true };
}

/**
 * Hapus produk PERMANEN (termasuk semua scan_logs, feedbacks,
 * positive_clicks miliknya, via ON DELETE CASCADE). Log aksi
 * dicatat SEBELUM delete supaya audit trail tetap valid.
 *
 * FIX: sebelumnya cuma menghapus baris di tabel products, TIDAK
 * pernah menghapus akun login (auth.users) pemiliknya - akibatnya
 * email tersebut "terjebak" selamanya dan tidak bisa dipakai daftar
 * ulang walau tokonya sudah dihapus. Sekarang, kalau owner produk ini
 * ternyata TIDAK punya toko lain sama sekali (sesuai kebijakan 1
 * email = 1 toko), akun login-nya ikut dihapus juga lewat Supabase
 * Admin API - baru emailnya benar-benar bebas dipakai lagi.
 */
export async function deleteProduct(
  productId: string,
  shortCode: string
): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const service = createServiceClient();

  await logAdminAction(supabase, productId, "delete_product", {
    short_code: shortCode,
  });

  // Ambil owner_id SEBELUM produk dihapus - dibutuhkan untuk langkah
  // pembersihan akun setelah ini.
  const { data: productRow } = await supabase
    .from("products")
    .select("owner_id")
    .eq("id", productId)
    .maybeSingle();

  const ownerId = (productRow as { owner_id: string | null } | null)
    ?.owner_id;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) {
    console.error("Gagal hapus produk:", error.message);
    return { success: false, error: "Gagal menghapus produk." };
  }

  if (ownerId) {
    // Pengecekan ini sengaja tetap ada (bukan langsung hapus) untuk
    // jaga-jaga kalau ada data lama dari SEBELUM kebijakan 1 email =
    // 1 toko diterapkan, di mana satu owner bisa saja masih terhubung
    // ke lebih dari satu produk. Kalau ternyata masih ada toko lain
    // yang terhubung ke owner ini, akunnya JANGAN ikut dihapus -
    // supaya toko lain itu tidak kehilangan akses login.
    const { count } = await service
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);

    if (!count || count === 0) {
      const { error: authDeleteError } = await service.auth.admin.deleteUser(
        ownerId
      );
      if (authDeleteError) {
        // Produk sudah terlanjur terhapus - jangan gagalkan seluruh
        // operasi karena ini, tapi WAJIB dicatat supaya admin tahu
        // emailnya belum benar-benar bebas dipakai lagi.
        console.error(
          "Produk terhapus, tapi gagal menghapus akun login pemiliknya:",
          authDeleteError.message
        );
      }
    }
  }

  revalidatePath("/admin/master");
  return { success: true };
}

/**
 * Ambil statistik dashboard lewat SATU RPC saja.
 */
export async function getDashboardStats(): Promise<{
  success: boolean;
  data?: {
    total_cards: number;
    active_cards: number;
    ready_stock: number;
    pending_review: number;
    total_scans: number;
    trend: { day: string; total: number }[];
    scan_counts: Record<string, number>;
  };
  error?: string;
}> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("admin_dashboard_stats");

  if (error) {
    console.error("Gagal ambil statistik:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

/**
 * Buat akun Reseller baru lewat Supabase Admin API (butuh service
 * role - operasi ini TIDAK BISA dilakukan lewat client biasa).
 * Role "reseller" disimpan di app_metadata, sama seperti super_admin.
 */
export async function createReseller(
  email: string,
  password: string,
  name: string
): Promise<ActionResult> {
  const service = createServiceClient();

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "reseller" },
  });

  if (error || !data.user) {
    console.error("Gagal buat akun reseller:", error?.message);
    return {
      success: false,
      error: error?.message ?? "Gagal membuat akun reseller.",
    };
  }

  const { error: insertError } = await service
    .from("resellers")
    .insert({ id: data.user.id, name });

  if (insertError) {
    console.error("Gagal simpan data reseller:", insertError.message);
    return {
      success: false,
      error: "Akun berhasil dibuat, tapi gagal menyimpan nama reseller.",
    };
  }

  revalidatePath("/admin/master");
  return { success: true };
}

/**
 * Daftar semua reseller + jumlah kartu yang dialokasikan ke masing².
 */
export async function listResellers(): Promise<{
  success: boolean;
  data?: { id: string; name: string; card_count: number }[];
  error?: string;
}> {
  const service = createServiceClient();

  const { data: resellers, error } = await service
    .from("resellers")
    .select("id, name")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: allocated } = await service
    .from("products")
    .select("reseller_id")
    .not("reseller_id", "is", null);

  const countMap: Record<string, number> = {};
  (allocated ?? []).forEach((row) => {
    if (row.reseller_id) {
      countMap[row.reseller_id] = (countMap[row.reseller_id] ?? 0) + 1;
    }
  });

  const data = (resellers ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    card_count: countMap[r.id] ?? 0,
  }));

  return { success: true, data };
}
