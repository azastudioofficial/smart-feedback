"use server";
// app/login/actions.ts

import { createServerSupabase } from "@/lib/supabase/server";

type LoginResult = { success: boolean; error?: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: "Email atau password salah." };
  }

  return { success: true };
}
