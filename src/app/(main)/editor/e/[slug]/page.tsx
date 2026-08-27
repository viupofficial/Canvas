"use client";

import React, { Suspense } from "react";
import EventCanvasGuard from "@/src/components/EventCanvasGuard";
import { LoadingState } from "@/src/components/canvas-states";

export const dynamic = "force-dynamic";

// Editor mode — locked to one purchased/assigned event. This is the customer
// canvas entrypoint (opened from My Event); designers assigned to a client
// event land here too, with the OWNER's user_id in the URL.
// URL: https://canvas.vi-up.com/editor/e/{slug}?user_id=123&event_id=456
// The [slug] is cosmetic only; user_id + event_id are the real identifiers and
// are validated against PHP, which confirms the event belongs to the user —
// ownership is the access check, no is_admin role required.
export default function EditorEventPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your canvas…" variant="canvas" />}>
      <EventCanvasGuard mode="editor" />
    </Suspense>
  );
}
