"use client";

import React, { Suspense } from "react";
import EventCanvasGuard from "@/src/components/EventCanvasGuard";
import { LoadingState } from "@/src/components/canvas-states";

export const dynamic = "force-dynamic";

// Designer event-editing mode — opens a specific event's design but keeps
// designer navigation available.
// URL: https://canvas.vi-up.com/designer/e/{slug}?user_id=123&event_id=456
// Requires role 3 (designer) and verified event ownership via PHP.
export default function DesignerEventPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your canvas…" variant="canvas" />}>
      <EventCanvasGuard mode="designer-event" />
    </Suspense>
  );
}
