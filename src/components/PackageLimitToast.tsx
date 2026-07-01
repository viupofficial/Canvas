"use client";

// Lightweight top-of-screen toast used to nudge Basic-package users to upgrade
// when they hit a feature limit (gallery / location / music). Decoupled from any
// component tree: call `showPackageToast(message)` from anywhere (sidebar tabs,
// handlers) and mount a single <PackageToastHost /> near the editor root.

import React, { useEffect, useState } from "react";

type Toast = { id: number; message: string };
type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let seq = 0;

export function showPackageToast(message: string) {
  const toast = { id: ++seq, message };
  listeners.forEach((l) => l(toast));
}

export function PackageToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const listener: Listener = (t) => setToast(t);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Re-runs whenever a new toast (new id) arrives, so identical messages still
  // reset the auto-dismiss timer.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] max-w-[92vw] sm:max-w-md rounded-full bg-[#7D5B59] text-white px-5 py-2.5 text-[13px] font-semibold shadow-lg flex items-center gap-2 animate-[fadeIn_0.15s_ease-out]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="M12 2L2 20h20L12 2z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" />
      </svg>
      <span>{toast.message}</span>
    </div>
  );
}
