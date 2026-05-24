import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const blob = file as File;
    const buffer = Buffer.from(await blob.arrayBuffer());

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = (blob.name || "music")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const ext = path.extname(safeName) || ".mp3";
    const base = path.basename(safeName, ext) || "music";
    const fileName = `${base}-${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, fileName);

    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ ok: true, url: `/uploads/${fileName}` });
  } catch (err: any) {
    console.error("upload-music error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
