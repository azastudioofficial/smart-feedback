// app/p/[code]/route.ts
// Link pendek untuk foto bukti keluhan: domain.com/p/xxxxxxxx
// Redirect langsung ke URL Cloudinary (secure_url) yang tersimpan.
// Cloudinary sendiri yang jadi CDN penyimpan fotonya - link ini
// hanya "alias pendek" biar rapi di pesan WhatsApp.

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ code: string }>;
};

export async function GET(request: NextRequest, { params }: Props) {
  const { code } = await params;
  const service = createServiceClient();

  const { data: feedback, error } = await service
    .from("feedbacks")
    .select("photo_url")
    .eq("photo_short_code", code)
    .maybeSingle();

  if (error || !feedback || !feedback.photo_url) {
    return new NextResponse("Foto tidak ditemukan atau link tidak valid.", {
      status: 404,
    });
  }

  return NextResponse.redirect(feedback.photo_url);
}
