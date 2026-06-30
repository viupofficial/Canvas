import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Token issuer for CLIENT-SIDE music uploads to Vercel Blob.
//
// Why client uploads: the previous implementation received the whole audio file
// via formData here and called put() server-side, so any file over Vercel's
// ~4.5MB serverless request-body limit was rejected — that's why "some music
// uploads passed and some didn't" (small clips worked, full-length songs
// failed). The browser now streams the file straight to blob storage with no
// function-body ceiling; this route only signs the upload.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        // Broad audio coverage (mp3/wav/ogg/m4a/flac…) plus a couple of generic
        // fallbacks so a quirky MIME type doesn't reject a valid music file.
        allowedContentTypes: [
          "audio/*",
          "video/mp4",
          "application/ogg",
          "application/octet-stream",
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 50 * 1024 * 1024, // 50MB — ample for full songs
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    console.error("upload-music token error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
