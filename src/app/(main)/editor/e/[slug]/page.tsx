"use client";

import React, { Suspense } from "react";
import EventCanvasGuard from "@/src/components/EventCanvasGuard";
import { LoadingState } from "@/src/components/canvas-states";

export const dynamic = "force-dynamic";

// Editor mode — locked to one purchased/assigned event.
// URL: https://canvas.vi-up.com/editor/e/{slug}?user_id=123&event_id=456
// The [slug] is cosmetic only; user_id + event_id are the real identifiers and
// are validated against PHP (which confirms event ownership and role 2 or 3).
export default function EditorEventPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your canvas…" />}>
      <EventCanvasGuard mode="editor" />
    </Suspense>
  );
}
