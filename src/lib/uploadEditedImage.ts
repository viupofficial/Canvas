import { upload } from "@vercel/blob/client";

/**
 * Convert a data URL to a Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mime });
}

// Blob is served back with whatever contentType we upload it under, so the
// extension and the header both have to follow the actual bytes — uploads are
// WebP now (see imageDownscale.ts), and older/fallback paths still send PNG.
const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Upload an edited image (from dataURL) to Vercel Blob storage.
 * Returns the public URL of the uploaded image.
 */
export async function uploadEditedImage(dataUrl: string): Promise<string> {
  try {
    const blob = dataUrlToBlob(dataUrl);
    const contentType = blob.type || "image/png";
    const ext = EXTENSIONS[contentType] ?? "png";
    const file = new File([blob], `edited-${Date.now()}.${ext}`, { type: contentType });

    const result = await upload(`edited-images/${Date.now()}-${Math.random().toString(36).slice(2)}`, file, {
      access: "public",
      contentType,
      handleUploadUrl: "/api/upload-image",
    });

    console.log("[uploadEditedImage] successfully uploaded to:", result.url);
    return result.url;
  } catch (err) {
    console.error("[uploadEditedImage] upload failed:", err);
    throw err;
  }
}
