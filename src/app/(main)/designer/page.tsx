"use client";

import React, { Suspense } from "react";
import DesignerGuard from "@/src/components/DesignerGuard";
import { LoadingState } from "@/src/components/canvas-states";
import "../../globals.css";

export const dynamic = "force-dynamic";

// /designer — full designer dashboard (gallery, create-new, manage designs).
// PHP redirects role-3 users here as /designer?user_id={user_id}. Access is
// validated against PHP (role 3 only). Designers open event-specific canvases
// at /designer/e/{slug}; the free per-design editor lives at /designer/{id}.
export default function DesignerPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your dashboard…" />}>
      <DesignerGuard />
    </Suspense>
  );
}
