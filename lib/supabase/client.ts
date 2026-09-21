// lib/supabase/client.ts
// Dipakai di Client Component ("use client") — misal form feedback,
// dashboard interaktif, dll. Hanya pakai ANON key (aman untuk browser).

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
