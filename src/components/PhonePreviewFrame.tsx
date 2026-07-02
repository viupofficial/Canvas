"use client";

import { useEffect, useState, type ReactNode } from "react";

const FRAME_PARAM = "__frame";
const PHONE_WIDTH = 390;
const DESKTOP_QUERY = "(min-width: 501px)";

/**
 * Responsive shell for the preview routes (/preview-local and /e/[slug], both
 * via PreviewShell): at phone widths (≤500px) children render full-bleed
 * exactly as before; above 500px the same URL is re-loaded inside a centered
 * phone-sized iframe, like Chrome DevTools mobile preview.
 *
 * An iframe (not a CSS wrapper) is required here: RsvpPlayer scales the canvas
 * from window.innerWidth/innerHeight, and the footer + overlays (rsvp-card,
 * guestbook-overlay, paper-overlay…) are position:fixed against the viewport.
 * Only an iframe gives them a 390px "viewport" so the bottom nav and popups
 * stay inside the phone frame instead of pinning to the real browser window.
 *
 * The framed copy carries ?__frame=1 so it always renders inline — no nesting,
 * and the inner page behaves byte-for-byte like the mobile view. Same-origin,
 * so IndexedDB (local preview payload) and localStorage are shared.
 */
export default function PhonePreviewFrame({ children }: { children: ReactNode }) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);

  useEffect(() => {
    // Inside the frame itself: always render inline, regardless of width.
    // Tag the document so globals.css can hide the desktop scrollbar that
    // would otherwise paint inside the 390px frame (scrolling still works).
    if (new URLSearchParams(window.location.search).get(FRAME_PARAM) === "1") {
      document.documentElement.classList.add("phone-frame-inner");
      return;
    }

    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = () => {
      if (mq.matches) {
        const url = new URL(window.location.href);
        url.searchParams.set(FRAME_PARAM, "1");
        setFrameSrc(url.pathname + url.search + url.hash);
      } else {
        setFrameSrc(null);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (!frameSrc) return <>{children}</>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#efece7",
        overflow: "hidden",
      }}
    >
      <iframe
        src={frameSrc}
        title="Invitation preview"
        allow="autoplay"
        style={{
          display: "block",
          width: PHONE_WIDTH,
          maxWidth: PHONE_WIDTH,
          height: "min(844px, 100vh)",
          border: "none",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.18)",
          background: "#ffffff",
        }}
      />
    </div>
  );
}
