import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Token issuer for CLIENT-SIDE edited image uploads to Vercel Blob.
// Handles images exported from the image editor to persistent blob storage.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/webp",
          "image/svg+xml",
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 10 * 1024 * 1024, // 10MB — ample for edited images
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    console.error("upload-image token error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
