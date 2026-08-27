"use client";

import React from "react";
import RsvpSkeleton, { RSVP_SKELETON_PAPER } from "@/src/components/RsvpSkeleton";

// Shared full-screen loading / error states for the guarded canvas routes
// (editor + designer). Kept brand-consistent with app/[userId]/page.tsx.

export function LoadingState({
  label = "Loading…",
  variant = "spinner",
}: {
  label?: string;
  /** "canvas" shows the RSVP skeleton — use it wherever a canvas is what
   *  is being waited on. Dashboards and account routing keep the spinner. */
  variant?: "spinner" | "canvas";
}) {
  if (variant === "canvas") {
    return (
      <div
        className="min-h-screen w-full flex flex-col"
        // Laid out inline as well: this is a Suspense fallback, so it renders at
        // the earliest moment the route has anything to show — routinely before
        // the stylesheet, when the utility classes are still inert.
        style={{
          minHeight: "100dvh",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: RSVP_SKELETON_PAPER,
        }}
      >
        <RsvpSkeleton className="flex-1 w-full min-h-0" style={{ flex: 1, minHeight: 0 }} />
        {label && (
          <p className="pb-6 text-center text-[14px] text-[#7D5B59]">{label}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center text-brand-dark"
      style={{ background: RSVP_SKELETON_PAPER }}
    >
      <div className="h-10 w-10 rounded-full border-2 border-[#D9C7C2] border-t-[#5a2d2d] animate-spin" />
      <p className="mt-4 text-[14px] text-[#7D5B59]">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  actionHref,
  actionLabel,
}: {
  title?: string;
  message?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center text-brand-dark px-6 text-center"
      style={{ background: RSVP_SKELETON_PAPER }}
    >
      <h1 className="text-[18px] font-bold text-[#7D5B59]">{title}</h1>
      {message && (
        <p className="mt-1 text-[14px] text-[#7D5B5999] max-w-[420px]">{message}</p>
      )}
      {actionHref && (
        <a
          href={actionHref}
          className="mt-5 inline-flex items-center gap-2 bg-[#5a2d2d] text-white px-5 py-2.5 rounded-full text-[15px] font-bold hover:opacity-90 transition"
        >
          {actionLabel || "Back"}
        </a>
      )}
    </div>
  );
}
