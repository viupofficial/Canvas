"use client";
import EventFooter from "../../../components/EventFooter";
import '../../globals.css';
import { useEffect, useRef, useState } from "react";

const PROJECT_PAGES = [];
const BORDER_URL: string | null = null;
const MUSIC_URL: string | null = null;

function CanvasPlayer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [gone, setGone]       = useState(false);
  const [animating, setAnimating] = useState(false);

  // Lock scroll on mount; unlock when envelope is gone
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (gone) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [gone]);

  function handleSealClick() {
    if (animating || gone) return;
    setAnimating(true);

    // Start music on seal click
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    // After animation flies out (1s), fade the cover then hide it
    setTimeout(() => {
      setTimeout(() => setGone(true), 500);
    }, 1000);
  }

  useEffect(() => {
    if (!rootRef.current) return;
    if (typeof window === "undefined") return;

    const w = 396;
    const h = 704;
    const root = rootRef.current;
    const createdCanvases: any[] = [];
    let cancelled = false;

    // Clear any prior render (StrictMode double-invokes effects in dev)
    root.innerHTML = "";

    import("fabric").then((mod: any) => {
      if (cancelled) return;
      const fabric = mod.fabric ?? mod.default ?? mod;
      PROJECT_PAGES.forEach((pageData: any, index: number) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `width:${w}px;max-width:100%;line-height:0;margin:0 auto;`;
        wrapper.id = "page-" + index;

        const canvasEl = document.createElement("canvas");
        canvasEl.id = "canvas-" + index;
        wrapper.appendChild(canvasEl);
        root.appendChild(wrapper);

        const rc = new fabric.Canvas(canvasEl, {
          selection: false,
          preserveObjectStacking: true,
        });
        rc.setDimensions({ width: w, height: h });
        rc.backgroundColor = "#ffffff";
        createdCanvases.push(rc);

        if (pageData) {
          rc.loadFromJSON(pageData, () => {
            rc.discardActiveObject();
            const toRemove: any[] = [];
            rc.forEachObject((obj: any) => {
              // Borders from the editor preview should not be baked into each canvas —
              // the export uses a single fixed overlay instead.
              if (obj?.isBorder) {
                toRemove.push(obj);
                return;
              }
              // Also strip images whose src matches the active border URL
              // (legacy serialized data may not carry the isBorder flag).
              if (BORDER_URL && obj?.type && String(obj.type).toLowerCase() === "image" && typeof obj.src === "string") {
                const path = obj.src.replace(/^https?:\/\/[^/]+/, "");
                if (path === BORDER_URL || obj.src === BORDER_URL) {
                  toRemove.push(obj);
                  return;
                }
              }
              obj.set({ selectable: false, hasControls: false, hasBorders: false, evented: true });
              obj.setCoords();
            });
            toRemove.forEach((o) => rc.remove(o));
            rc.requestRenderAll();
          });
        }
      });
    });

    return () => {
      cancelled = true;
      createdCanvases.forEach((c) => { try { c.dispose(); } catch {} });
      root.innerHTML = "";
    };
  }, []);

  return (
    <>

        {!gone && (
          <>
            <style>{`
              .env-cover {
                position: fixed; inset: 0; z-index: 9999;
                background-color: "#f5e8dd";
                overflow: hidden;
                display: flex; flex-direction: column;
                align-items: center; justify-content: flex-start;
                transition: opacity 0.5s ease;
              }
              .env-cover.env-fading { opacity: 0; pointer-events: none; }
              .env-part { transition: transform 1s ease, opacity 1s ease; }
              .env-move-up   { transform: translateY(-110vh) !important; opacity: 0 !important; }
              .env-move-down { transform: translateY(110vh)  !important; opacity: 0 !important; }
            `}</style>

            <div className={`env-cover${animating ? " env-fading" : ""}`}>

              {/* Top texts */}
              <span className={`env-part${animating ? " env-move-up" : ""}`}
                style={{ fontFamily: "serif", fontStyle: "italic", fontSize: 20, color: "#2f2f2f", marginTop: 60, zIndex: 5, position: "relative" }}>
                Undangan
              </span>
              <span className={`env-part${animating ? " env-move-up" : ""}`}
                style={{ fontFamily: "serif", fontStyle: "italic", fontSize: 16, color: "#2f2f2f", marginTop: 6, zIndex: 5, position: "relative" }}>
                Walimatulurus
              </span>

              {/* Logo */}
              <img className={`env-part${animating ? " env-move-up" : ""}`}
                src="/Maya&Asyraaf_Blk.png" alt="logo"
                style={{ width: 180, height: "auto", marginTop: 24, zIndex: 5, position: "relative" }} />

              {/* Press to open */}
              <span className={`env-part${animating ? " env-move-down" : ""}`}
                style={{ fontFamily: "serif", fontStyle: "italic", fontSize: 14, color: "#555", marginTop: 20, zIndex: 5, position: "relative" }}>
                Press to open
              </span>

              {/* Envelope head — overlaps from centre-bottom area */}
              <img className={`env-part${animating ? " env-move-up" : ""}`}
                src="/head.png" alt="envelope head"
                style={{ position: "absolute", bottom: 140, left: "50%", transform: "translateX(-50%)", width: "120%", maxWidth: 475, zIndex: 3, pointerEvents: "none" }} />

              {/* Seal — sits on top of head, clickable */}
              <img className={`env-part${animating ? " env-move-up" : ""}`}
                src="/seal.png" alt="seal"
                onClick={handleSealClick}
                style={{ position: "absolute", bottom: 195, left: "50%", transform: "translateX(-50%)", width: 110, height: 110, cursor: "pointer", zIndex: 4 }} />

              {/* Envelope body — anchored to bottom */}
              <img className={`env-part${animating ? " env-move-down" : ""}`}
                src="/body.png" alt="envelope body"
                style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 396, zIndex: 2, pointerEvents: "none" }} />
            </div>
          </>
        )}

      <div
        ref={rootRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          zIndex: 100,
        }}
      />
      {BORDER_URL && (
        <img
          src={BORDER_URL}
          alt=""
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 396,
            maxWidth: "100%",
            height: "100vh",
            pointerEvents: "none",
            zIndex: /bordeline\.svg$/i.test(BORDER_URL) ? 110 : 10,
            objectFit: "fill",
          }}
        />
      )}
      {MUSIC_URL && (
        <audio
          ref={audioRef}
          src={MUSIC_URL}
          loop
          controls
          style={{ position: "fixed", left: 12, bottom: 80, zIndex: 10 }}
        />
      )}
    </>
  );
}

export default function Page() {
  const contacts = [];
  const moneyGift = null;
  const calendar = null;
  const location = null;
  const rsvpConfig = null;

  return (
    <main>
      <CanvasPlayer />
      <EventFooter
        contacts={contacts}
        moneyGift={moneyGift}
        calendar={calendar}
        location={location}
        rsvpConfig={rsvpConfig}
      />
    </main>
  );
}
