import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Token issuer for CLIENT-SIDE blob uploads of the published event JSON.
//
// Why client uploads: a published design embeds every photo (and a per-page
// background) as a base64 data URL, so the payload routinely exceeds Vercel's
// 4.5MB serverless REQUEST-BODY limit. The old implementation POSTed the whole
// JSON here and called put() server-side, so large designs were rejected with a
// 413 before this handler ever ran — the blob was never updated and /e/{slug}
// kept serving the previously published (smaller) version, dropping music,
// photos and recent edits. The browser now streams the JSON straight to blob
// storage (no function-body limit); this route only signs the upload.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/json"],
        // Keep the deterministic events/{slug}.json path and overwrite in place
        // so the live link is stable and always reflects the latest publish.
        addRandomSuffix: false,
        allowOverwrite: true,
        // Generous ceiling for image-heavy designs (well above the old 4.5MB).
        maximumSizeInBytes: 100 * 1024 * 1024,
      }),
      // No server-side post-processing is needed; the blob is the source of
      // truth the live page reads. (This webhook does not fire on localhost.)
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    console.error("export-to-rsvp token error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
