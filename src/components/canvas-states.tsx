"use client";

import React from "react";

// Shared full-screen loading / error states for the guarded canvas routes
// (editor + designer). Kept brand-consistent with app/[userId]/page.tsx.

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-cream text-brand-dark">
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-cream text-brand-dark px-6 text-center">
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
