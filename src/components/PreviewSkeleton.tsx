"use client";

import React from "react";
import RsvpSkeleton, { RSVP_SKELETON_PAPER } from "@/src/components/RsvpSkeleton";

// Full-bleed loading state for the preview surfaces (/preview-local while it
// polls IndexedDB for the payload, /e/[slug] while the server fetches the blob).
//
// No label, unlike the editor's LoadingState: these routes are what a guest
// opens, and "Loading your canvas…" over an invitation breaks the illusion.
//
// 100dvh, not 100vh — on mobile Safari/Chrome the URL bar makes vh taller than
// the visible viewport, which would push the skeleton's bottom off-screen and
// let it scroll, on a screen that has nothing to scroll to.
export default function PreviewSkeleton() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        minHeight: "100dvh",
        background: RSVP_SKELETON_PAPER,
        overflow: "hidden",
      }}
    >
      <RsvpSkeleton className="h-full w-full" />
    </div>
  );
}
