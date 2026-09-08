import { NextRequest, NextResponse } from "next/server";
import {
  MANIFEST_TIMEOUT_MS,
  REMOTE_TEMPLATE_MANIFEST_ENDPOINT,
  TEMPLATE_MANIFEST_PARAM,
} from "@/src/config/remoteTemplates";

// Same-origin relay for the iFastNet template asset manifest.
//
// Why this exists: the PHP endpoint answers with
// `Access-Control-Allow-Origin: <calling origin>` only for the origins in its
// own allowlist, and the only local one it names is http://localhost:3000. A
// dev server opened at any other address — a LAN IP so a real phone can reach
// it, 127.0.0.1, a tunnel — gets a 200 with no CORS header, the browser throws
// the body away, and the Templates panel reports "The template library could
// not be reached". Asking our own origin sidesteps CORS entirely, so templates
// work from every dev address without anyone editing the PHP allowlist.
//
// Scope: the JSON manifest ONLY. Template media is served with
// `Access-Control-Allow-Origin: *` and is always fetched straight from the
// asset host — see the "no proxy in the asset path" note in
// src/config/remoteTemplates.ts. The browser only routes here in development
// (TEMPLATE_MANIFEST_ENDPOINT decides); production still calls PHP directly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The upstream is public, cacheable, read-only JSON, but the id still goes into
// a URL we build — so accept only what a template id can actually be rather
// than forwarding arbitrary text.
const TEMPLATE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req: NextRequest) {
  const templateId = req.nextUrl.searchParams.get(TEMPLATE_MANIFEST_PARAM);
  if (!templateId || !TEMPLATE_ID.test(templateId)) {
    return NextResponse.json(
      { success: false, error: `Missing or malformed ${TEMPLATE_MANIFEST_PARAM}.` },
      { status: 400 },
    );
  }

  const upstream = new URL(REMOTE_TEMPLATE_MANIFEST_ENDPOINT);
  upstream.searchParams.set(TEMPLATE_MANIFEST_PARAM, templateId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const res = await fetch(upstream, {
      method: "GET",
      // No credentials and no forwarded headers: the manifest is public, and a
      // relay that passed the caller's cookies on would be a confused deputy.
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });

    const body = await res.text();
    // Pass the upstream status through unchanged so the client's existing
    // "answered with HTTP nnn" / "unreadable reply" messages stay accurate.
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return NextResponse.json(
      {
        success: false,
        error: aborted
          ? "The template library took too long to answer."
          : "The template library could not be reached.",
      },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
