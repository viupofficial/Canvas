import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

// Store uploaded music in Vercel Blob (same store the published events use).
// The previous implementation wrote into public/uploads via fs, which only
// works in local dev — on a live deployment the filesystem is read-only and
// public/ is served from the build, so uploads silently failed there.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const blob = file as File;

    const safeName =
      (blob.name || "music")
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, "-")
        .replace(/^-+|-+$/g, "") || "music";

    const result = await put(`music/${Date.now()}-${safeName}`, blob, {
      access: "public",
      contentType: blob.type || "audio/mpeg",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ ok: true, url: result.url });
  } catch (err: any) {
    console.error("upload-music error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
