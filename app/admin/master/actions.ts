"use server";
// app/admin/master/actions.ts

import { revalidatePath } from "next/cache";
import {
  createServerSupabase,
  createServiceClient,
} from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guards";
import { safeHttpUrl } from "@/lib/safe-url";
import {
  collectProductAssets,
  hasAssets,
  purgeAssets,
  recordPendingCleanup,
} from "@/lib/asset-cleanup";

type ActionResult = { success: boolean; error?: string };

type GeneratedItem = { id: string; short_code: string };

export type Plan = "basic" | "pro";

type InventoryItem = {
  id: string;
  short_code: string;
  business_name: string | null;
  google_review_url: string | null;
  owner_whatsapp: string | null;
  is_active: boolean;
  is_suspended: boolean;
  pending_review: boolean;
  stock_activated: boolean;
  plan: Plan;
  reseller_name: string | null;
  created_at: string;
  last_scanned_at: string | null;
};

/**
 * Ambil 1 halaman kartu (25 per halaman) - dipakai bersama Admin &
 * Reseller. Pakai client yang IKUT SESI LOGIN, jadi RLS otomatis
 * membatasi: reseller cuma dapat kartu miliknya, admin dapat semua.
 * Ini menghindari narik SEMUA baris sekaligus saat data sudah banyak.
 */
export type InventoryFilters = {
  // Nama toko ATAU ID kartu (short_code) - dicek sekaligus di server
  // biar admin nggak perlu tahu mau cari yang mana.
  search?: string;
  // "" / undefined = semua reseller. Cocok dengan kolom products.reseller_id.
  resellerId?: string;
  // Kosongkan untuk semua status. Nilainya dicek di JS setelah ambil
  // data (bukan filter SQL) karena "status" kartu itu turunan dari 3
  // kolom boolean sekaligus (is_suspended, pending_review, is_active),
  // bukan 1 kolom tunggal.
  status?: "aktif" | "stok_siap" | "stok_aktif" | "menunggu" | "suspended" | "";
};

export async function getInventoryPage(
  page: number,
  pageSize: number = 25,
  filters: InventoryFilters = {}
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

  let query = supabase
    .from("products")
    .select(
      "id, short_code, business_name, google_review_url, owner_whatsapp, is_active, is_suspended, pending_review, stock_activated, plan, created_at, last_scanned_at, resellers(name)",
      { count: "exact" }
    );

  if (filters.search?.trim()) {
    // escape koma & spasi ganda - karakter itu berarti khusus di
    // sintaks .or() milik PostgREST kalau tidak dibersihkan dulu.
    const term = filters.search.trim().replace(/[,()%]/g, " ").slice(0, 100);
    query = query.or(`business_name.ilike.%${term}%,short_code.ilike.%${term}%`);
  }
  if (filters.resellerId) {
    query = query.eq("reseller_id", filters.resellerId);
  }
  switch (filters.status) {
    case "suspended":
      query = query.eq("is_suspended", true);
      break;
    case "menunggu":
      query = query.eq("is_suspended", false).eq("pending_review", true);
      break;
    case "aktif":
      query = query
        .eq("is_suspended", false)
        .eq("pending_review", false)
        .eq("is_active", true);
      break;
    case "stok_siap":
      // Kartu kosong yang BELUM diberi tanda stok aktif.
      query = query
        .eq("is_suspended", false)
        .eq("pending_review", false)
        .eq("is_active", false)
        .eq("stock_activated", false);
      break;
    case "stok_aktif":
      // Kartu kosong yang sudah "stok aktif" (aktivasi tanpa persetujuan).
      query = query
        .eq("is_suspended", false)
        .eq("pending_review", false)
        .eq("is_active", false)
        .eq("stock_activated", true);
      break;
  }

  const { data, error, count } = await query
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
  resellerId: string | null = null,
  plan: Plan = "basic"
): Promise<{ success: boolean; data?: GeneratedItem[]; error?: string }> {
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return { success: false, error: guard.error };

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

  const generated: GeneratedItem[] = data ?? [];

  // Kartu baru otomatis Basic (default kolom). Kalau diminta Pro, naikkan
  // sekarang lewat service client - RPC admin_generate_products tidak
  // perlu diubah.
  if (plan === "pro" && generated.length > 0) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.app_metadata?.role !== "super_admin") {
      return { success: false, error: "Hanya Super Admin yang bisa membuat kartu Pro." };
    }
    const service = createServiceClient();
    const { error: planError } = await service
      .from("products")
      .update({ plan: "pro" })
      .in("id", generated.map((g) => g.id));

    if (planError) {
      console.error("Kartu dibuat, tapi gagal set paket Pro:", planError.message);
      return {
        success: false,
        error: "Kartu berhasil dibuat tapi gagal diset ke Pro. Ubah manual lewat menu Semua Kartu.",
      };
    }
  }

  revalidatePath("/admin/master");
  return { success: true, data: generated };
}

/**
 * Ubah paket (Basic/Pro) beberapa kartu sekaligus, berdasarkan id.
 * HANYA Super Admin. Dicek di sini DAN di trigger database
 * (protect_plan_column) - jadi tetap aman kalau action ini dipanggil
 * dari luar UI.
 */
export async function setPlan(
  productIds: string[],
  plan: Plan
): Promise<{ success: boolean; updated?: number; error?: string }> {
  if (plan !== "basic" && plan !== "pro") {
    return { success: false, error: "Paket tidak valid." };
  }
  const ids = Array.from(new Set(productIds)).filter(Boolean);
  if (ids.length === 0) {
    return { success: false, error: "Belum ada kartu yang dipilih." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.app_metadata?.role !== "super_admin") {
    return { success: false, error: "Hanya Super Admin yang bisa mengubah paket." };
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("products")
    .update({ plan })
    .in("id", ids)
    .select("id");

  if (error) {
    console.error("Gagal ubah paket:", error.message);
    return { success: false, error: "Gagal mengubah paket." };
  }

  const updatedIds = (data ?? []).map((r) => r.id as string);
  if (updatedIds.length > 0) {
    await service.from("admin_actions").insert(
      updatedIds.map((id) => ({
        actor_id: user.id,
        product_id: id,
        action: plan === "pro" ? "upgrade_pro" : "downgrade_basic",
        detail: { plan },
      }))
    );
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true, updated: updatedIds.length };
}

/**
 * Upgrade/turunkan paket lewat DAFTAR KODE (short_code) yang ditempel,
 * dipisah spasi, koma, atau baris baru. Berguna kalau kartunya tersebar
 * di banyak halaman tabel. Mengembalikan kode yang tidak ditemukan.
 */
export async function setPlanByCodes(
  rawCodes: string,
  plan: Plan
): Promise<{
  success: boolean;
  updated?: number;
  notFound?: string[];
  error?: string;
}> {
  const codes = Array.from(
    new Set(
      rawCodes
        .split(/[\s,;]+/)
        .map((c) => c.trim())
        .filter(Boolean)
        // Pengguna sering menempel URL penuh (.../r/KODE) - ambil kodenya saja.
        .map((c) => c.replace(/^.*\/r\//i, ""))
    )
  );

  if (codes.length === 0) {
    return { success: false, error: "Tempel minimal satu kode kartu." };
  }
  if (codes.length > 500) {
    return { success: false, error: "Maksimal 500 kode sekali proses." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.app_metadata?.role !== "super_admin") {
    return { success: false, error: "Hanya Super Admin yang bisa mengubah paket." };
  }

  const service = createServiceClient();
  const { data: found, error: findError } = await service
    .from("products")
    .select("id, short_code")
    .in("short_code", codes);

  if (findError) {
    return { success: false, error: "Gagal mencari kartu." };
  }

  const foundCodes = new Set((found ?? []).map((f) => f.short_code as string));
  const notFound = codes.filter((c) => !foundCodes.has(c));

  const result = await setPlan(
    (found ?? []).map((f) => f.id as string),
    plan
  );
  if (!result.success) return { success: false, error: result.error };

  return { success: true, updated: result.updated, notFound };
}

/**
 * "Aktifkan stok": tandai kartu KOSONG sebagai stok aktif, sehingga
 * pembeli yang mengaktivasinya langsung aktif tanpa permohonan/persetujuan
 * (lihat activateProduct di app/activate/[id]/actions.ts). Kartu yang
 * tidak ditandai tetap lewat alur permohonan seperti biasa.
 *
 * Admin & reseller boleh. Pakai client yang IKUT SESI LOGIN, jadi RLS
 * membatasi reseller ke kartunya sendiri. Aktifkan hanya berlaku untuk
 * kartu kosong (belum aktif, tidak menunggu persetujuan, tidak
 * ditangguhkan); membatalkan berlaku untuk kartu yang sedang bertanda.
 */
export async function setStockActivation(
  productIds: string[],
  activate: boolean
): Promise<{ success: boolean; updated?: number; skipped?: number; error?: string }> {
  const guard = await requireRole(["super_admin", "reseller"]);
  if (!guard.ok) return { success: false, error: guard.error };

  const ids = Array.from(new Set(productIds)).filter(Boolean);
  if (ids.length === 0) {
    return { success: false, error: "Belum ada kartu yang dipilih." };
  }
  if (ids.length > 200) {
    return { success: false, error: "Maksimal 200 kartu sekali proses." };
  }

  const supabase = await createServerSupabase();

  let query = supabase
    .from("products")
    .update({ stock_activated: activate })
    .in("id", ids);
  query = activate
    ? query
        .eq("is_active", false)
        .eq("pending_review", false)
        .eq("is_suspended", false)
    : query.eq("stock_activated", true);

  const { data, error } = await query.select("id");

  if (error) {
    console.error("Gagal ubah stok aktif:", error.message);
    return { success: false, error: "Gagal mengubah status stok." };
  }

  const updatedIds = (data ?? []).map((r) => r.id as string);
  if (updatedIds.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Catatan audit - best-effort, tidak menggagalkan aksi utama.
    await supabase.from("admin_actions").insert(
      updatedIds.map((id) => ({
        actor_id: user?.id,
        product_id: id,
        action: activate ? "stock_activate" : "stock_deactivate",
        detail: null,
      }))
    );
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return {
    success: true,
    updated: updatedIds.length,
    skipped: ids.length - updatedIds.length,
  };
}

/**
 * Sama seperti setStockActivation, tapi untuk SEMUA kartu yang cocok
 * dengan filter (cari / reseller) - berguna saat stok ratusan kartu dan
 * tidak praktis dicentang per halaman. Aktifkan memproses kartu kosong
 * yang belum bertanda; membatalkan memproses kartu yang sedang bertanda.
 */
export async function setStockActivationByFilter(
  filters: { search?: string; resellerId?: string },
  activate: boolean
): Promise<{ success: boolean; updated?: number; error?: string }> {
  const guard = await requireRole(["super_admin", "reseller"]);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createServerSupabase();

  let query = supabase
    .from("products")
    .update({ stock_activated: activate }, { count: "exact" });

  if (filters.search?.trim()) {
    // Pembersihan yang sama dengan getInventoryPage (koma/kurung punya
    // arti khusus di sintaks .or() milik PostgREST).
    const term = filters.search.trim().replace(/[,()%]/g, " ").slice(0, 100);
    query = query.or(`business_name.ilike.%${term}%,short_code.ilike.%${term}%`);
  }
  if (filters.resellerId) {
    query = query.eq("reseller_id", filters.resellerId);
  }
  query = activate
    ? query
        .eq("is_active", false)
        .eq("pending_review", false)
        .eq("is_suspended", false)
        .eq("stock_activated", false)
    : query.eq("stock_activated", true);

  const { count, error } = await query;

  if (error) {
    console.error("Gagal ubah stok aktif (massal):", error.message);
    return { success: false, error: "Gagal mengubah status stok." };
  }

  const updated = count ?? 0;
  if (updated > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("admin_actions").insert({
      actor_id: user?.id,
      product_id: null,
      action: activate ? "stock_activate_bulk" : "stock_deactivate_bulk",
      detail: {
        count: updated,
        search: filters.search?.trim() || null,
        reseller_id: filters.resellerId || null,
      },
    });
  }

  revalidatePath("/admin/master");
  revalidatePath("/reseller");
  return { success: true, updated };
}

export async function toggleSuspend(
  productId: string,
  suspend: boolean
): Promise<ActionResult> {
  const guard = await requireRole(["super_admin", "reseller"]);
  if (!guard.ok) return { success: false, error: guard.error };

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
  const guard = await requireRole(["super_admin", "reseller"]);
  if (!guard.ok) return { success: false, error: guard.error };

  const reviewUrl = safeHttpUrl(data.googleReviewUrl);
  if (!reviewUrl) {
    return {
      success: false,
      error: "Link Google Review tidak valid (harus diawali http:// atau https://).",
    };
  }

  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("products")
    .update({
      business_name: data.businessName.trim().slice(0, 120),
      google_review_url: reviewUrl,
      owner_whatsapp: data.ownerWhatsapp.trim().slice(0, 30),
    })
    .eq("id", productId);

  if (error) {
    console.error("Gagal override produk:", error.message);
    return { success: false, error: "Gagal menyimpan perubahan." };
  }

  await logAdminAction(supabase, productId, "override_edit", {
    ...data,
    googleReviewUrl: reviewUrl,
  });
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
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return { success: false, error: guard.error };

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

  // Kumpulkan SEMUA file toko ini (logo, cover, ikon custom, foto
  // keluhan) SEBELUM reset - setelah reset petunjuknya hilang dan
  // file di Cloudinary jadi yatim selamanya.
  const assets = await collectProductAssets(service, productId);

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

  // Kosongkan statistik kartu supaya klien baru mulai dari nol. RPC
  // admin_reset_product cuma mengosongkan data toko - riwayat scan lama
  // tetap tinggal (angka Scan tidak berubah). scan_logs & positive_clicks
  // (= klik tombol "Tulis Review di Google Maps") tidak punya policy
  // DELETE untuk admin, jadi pakai service client.
  //
  // admin_reset_product (SQL) hanya mengosongkan nama toko, link review,
  // WhatsApp, owner, dan logo - TIDAK menghapus keluhan, cover, ikon
  // sosial, maupun warna brand. Itu dilengkapi di sini: file toko lama
  // (Cloudinary + Storage lama) dihapus, lalu keluhan lama dan kolom
  // tampilan dikosongkan - klien baru tidak boleh mewarisi keluhan,
  // cover, atau tema klien sebelumnya.
  // Kalau ada file yang gagal dihapus, dicatat dan dicoba lagi cron.
  if (hasAssets(assets)) {
    const { failed, errors } = await purgeAssets(service, assets);
    await recordPendingCleanup(
      service,
      `reset_product:${productId}`,
      failed,
      errors
    );
  }

  const [scanDel, clickDel, feedbackDel, lastScanReset] = await Promise.all([
    service.from("scan_logs").delete().eq("product_id", productId),
    service.from("positive_clicks").delete().eq("product_id", productId),
    service.from("feedbacks").delete().eq("product_id", productId),
    service
      .from("products")
      .update({
        last_scanned_at: null,
        logo_url: null,
        cover_image_url: null,
        cover_position: null,
        brand_color: null,
        tagline: null,
        terms_accepted_at: null,
        social_links: [],
      })
      .eq("id", productId),
  ]);

  const statsError =
    scanDel.error ??
    clickDel.error ??
    feedbackDel.error ??
    lastScanReset.error;
  if (statsError) {
    console.error("Produk sudah direset, tapi gagal mengosongkan statistik:", statsError.message);
    revalidatePath("/admin/master");
    revalidatePath("/reseller");
    return {
      success: false,
      error:
        "Data toko sudah direset, tapi riwayat scan gagal dikosongkan. Coba Reset sekali lagi.",
    };
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
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return { success: false, error: guard.error };

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

  // Kumpulkan SEMUA file toko ini SEBELUM baris dihapus - ON DELETE
  // CASCADE ikut membuang baris keluhannya, dan setelah itu tidak ada
  // lagi petunjuk untuk menemukan fotonya di Cloudinary.
  const assets = await collectProductAssets(service, productId);

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

  // Hapus file-filenya SETELAH baris terhapus (bukan sebelum): kalau
  // penghapusan baris ditolak (mis. RLS), file toko tidak boleh sudah
  // terlanjur hilang. Yang gagal dihapus dicatat dan dicoba lagi oleh
  // cron harian, jadi tidak jadi file yatim.
  if (hasAssets(assets)) {
    const { failed, errors } = await purgeAssets(service, assets);
    await recordPendingCleanup(
      service,
      `delete_product:${shortCode}`,
      failed,
      errors
    );
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
  // WAJIB: tanpa ini siapa pun yang login (termasuk pelanggan yang baru
  // daftar lewat form aktivasi) bisa membuat akun reseller.
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return { success: false, error: guard.error };

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
  const guard = await requireRole(["super_admin"]);
  if (!guard.ok) return { success: false, error: guard.error };

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
