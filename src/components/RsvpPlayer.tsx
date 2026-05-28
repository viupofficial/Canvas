"use client";

import { useEffect, useRef, useState } from "react";

export type EnvPos = {
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  originX: "left" | "center" | "right";
  originY: "top" | "center" | "bottom";
};

export type EnvelopeData = {
  headSrc: string;
  sealSrc: string;
  bodySrc: string;
  logoSrc: string;
  bgColor: string;
  titleText: string;
  subtitleText: string;
  pressText: string;
  headPos?: EnvPos;
  sealPos?: EnvPos;
  bodyPos?: EnvPos;
  logoPos?: EnvPos;
  titlePos?: EnvPos;
  subtitlePos?: EnvPos;
  pressPos?: EnvPos;
  titleStyle?: any;
  subtitleStyle?: any;
  pressStyle?: any;
};

const STAGE_W = 396;
const STAGE_H = 704;

function originOffset(pos: EnvPos | undefined) {
  const p = pos ?? { left: 0, top: 0, width: 0, height: 0, angle: 0, originX: "left" as const, originY: "top" as const };
  let dx = 0, dy = 0;
  if (p.originX === "center") dx = -p.width / 2;
  else if (p.originX === "right") dx = -p.width;
  if (p.originY === "center") dy = -p.height / 2;
  else if (p.originY === "bottom") dy = -p.height;
  return { x: p.left + dx, y: p.top + dy };
}

function posStyle(pos: EnvPos | undefined): React.CSSProperties {
  if (!pos || (pos.width === 0 && pos.height === 0)) return { display: "none" };
  const { x, y } = originOffset(pos);
  return {
    position: "absolute",
    left: x,
    top: y,
    width: pos.width,
    height: pos.height,
    transform: pos.angle ? `rotate(${pos.angle}deg)` : undefined,
    transformOrigin: "top left",
  };
}

export type RsvpPlayerProps = {
  pages: any[];
  envelope: EnvelopeData | null;
  musicUrl: string | null;
  borderUrl: string | null;
};

export default function RsvpPlayer({ pages, envelope, musicUrl, borderUrl }: RsvpPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [gone, setGone] = useState(!envelope);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!envelope) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [envelope]);

  useEffect(() => {
    if (gone) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }, [gone]);

  function handleSealClick() {
    if (animating || gone) return;
    setAnimating(true);
    if (audioRef.current) audioRef.current.play().catch(() => {});
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
    const cancellers: Array<() => void> = [];
    let cancelled = false;

    // Animate objects on a view-only canvas based on their `animation` property.
    // Base values are captured once; one-shots ease to those targets, loops
    // oscillate around them. Mutating here is safe — the player never saves back.
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
    const ANIMS = new Set(["fade-in", "slide-up", "zoom-in", "float", "pulse"]);
    const startAnimations = (rc: any) => {
      const animated: Array<{ obj: any; type: string; top: number; opacity: number; scaleX: number; scaleY: number }> = [];
      rc.forEachObject((obj: any) => {
        const type = obj?.animation;
        if (!type || !ANIMS.has(type)) return;
        const base = {
          obj,
          type,
          top: obj.top ?? 0,
          opacity: obj.opacity ?? 1,
          scaleX: obj.scaleX ?? 1,
          scaleY: obj.scaleY ?? 1,
        };
        animated.push(base);
        // Seed the start state for one-shot intros so they don't flash at target.
        if (type === "fade-in") obj.set({ opacity: 0 });
        else if (type === "slide-up") obj.set({ opacity: 0, top: base.top + 24 });
        else if (type === "zoom-in") obj.set({ opacity: 0, scaleX: base.scaleX * 0.85, scaleY: base.scaleY * 0.85 });
        obj.setCoords?.();
      });
      if (!animated.length) return;

      const start = performance.now();
      let rafId = 0;
      const tick = (now: number) => {
        if (cancelled) return;
        const t = now - start;
        let active = false;
        for (const a of animated) {
          const obj = a.obj;
          switch (a.type) {
            case "fade-in": {
              const p = Math.min(t / 600, 1);
              obj.opacity = a.opacity * easeOut(p);
              if (p < 1) active = true;
              break;
            }
            case "slide-up": {
              const p = Math.min(t / 600, 1);
              const e = easeOut(p);
              obj.opacity = a.opacity * e;
              obj.top = a.top + 24 * (1 - e);
              if (p < 1) active = true;
              break;
            }
            case "zoom-in": {
              const p = Math.min(t / 500, 1);
              const e = easeOut(p);
              obj.opacity = a.opacity * e;
              const s = 0.85 + 0.15 * e;
              obj.scaleX = a.scaleX * s;
              obj.scaleY = a.scaleY * s;
              if (p < 1) active = true;
              break;
            }
            case "float": {
              const off = -8 * (0.5 - 0.5 * Math.cos((t / 3000) * Math.PI * 2));
              obj.top = a.top + off;
              active = true;
              break;
            }
            case "pulse": {
              const s = 1 + 0.05 * (0.5 - 0.5 * Math.cos((t / 1800) * Math.PI * 2));
              obj.scaleX = a.scaleX * s;
              obj.scaleY = a.scaleY * s;
              active = true;
              break;
            }
          }
          obj.setCoords?.();
        }
        rc.requestRenderAll();
        if (active) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      cancellers.push(() => cancelAnimationFrame(rafId));
    };

    root.innerHTML = "";

    import("fabric").then((mod: any) => {
      if (cancelled) return;
      const fabric = mod.fabric ?? mod.default ?? mod;
      pages.forEach((pageData: any, index: number) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `width:${w}px;max-width:100%;line-height:0;margin:0 auto;pointer-events:none;user-select:none;`;
        wrapper.id = "page-" + index;

        const canvasEl = document.createElement("canvas");
        canvasEl.id = "canvas-" + index;
        wrapper.appendChild(canvasEl);
        root.appendChild(wrapper);

        const rc = new fabric.Canvas(canvasEl, {
          selection: false,
          preserveObjectStacking: true,
          interactive: false,
          skipTargetFind: true,
        });
        rc.setDimensions({ width: w, height: h });
        rc.backgroundColor = "#ffffff";
        createdCanvases.push(rc);

        if (pageData) {
          rc.loadFromJSON(pageData, () => {
            rc.discardActiveObject();
            const toRemove: any[] = [];
            rc.forEachObject((obj: any) => {
              if (obj?.isBorder) {
                toRemove.push(obj);
                return;
              }
              if (borderUrl && obj?.type && String(obj.type).toLowerCase() === "image" && typeof obj.src === "string") {
                const path = obj.src.replace(/^https?:\/\/[^/]+/, "");
                if (path === borderUrl || obj.src === borderUrl) {
                  toRemove.push(obj);
                  return;
                }
              }
              obj.set({ selectable: false, hasControls: false, hasBorders: false, evented: false });
              obj.setCoords();
            });
            toRemove.forEach((o) => rc.remove(o));
            startAnimations(rc);
            rc.requestRenderAll();
          });
        }
      });
    });

    return () => {
      cancelled = true;
      cancellers.forEach((c) => { try { c(); } catch {} });
      createdCanvases.forEach((c) => { try { c.dispose(); } catch {} });
      root.innerHTML = "";
    };
  }, [pages, borderUrl]);

  return (
    <>
      {envelope && !gone && (
        <>
          <style>{`
            .env-cover {
              position: fixed; inset: 0; z-index: 9999;
              background-color: ${envelope.bgColor};
              overflow: hidden;
              display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              transition: opacity 0.5s ease;
            }
            .env-cover.env-fading { opacity: 0; pointer-events: none; }
            .env-part { transition: transform 1s ease, opacity 1s ease; }
            .env-move-up   { transform: translateY(-110vh) !important; opacity: 0 !important; }
            .env-move-down { transform: translateY(110vh)  !important; opacity: 0 !important; }

            .env-head {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: auto !important;
              transform-origin: left top;
              z-index: 3;
              pointer-events: none;
            }

            .env-seal {
              position: absolute !important;
              left: 140px !important;
              top: 280px !important;
              width: 100px !important;
              height: 100px !important;
              transform-origin: left top;
              z-index: 4;
              cursor: pointer;
            }

            .env-body {
              position: absolute !important;
              left: 0 !important;
              bottom: -130px !important;
              width: 110% !important;
              height: 150% !important;
              transform-origin: left bottom;
              z-index: 2;
              pointer-events: none;
            }

            .env-press {
              left: 163.608px !important;
              top: 400px !important;
              width: 52.7832px !important;
              height: 93.79px !important;
            }
            @media (max-width: 375px) {
              .env-press {
                top: 380px !important;
              }
            }
          `}</style>

          <div className={`env-cover${animating ? " env-fading" : ""}`}>
            <div
              style={{
                position: "relative",
                width: STAGE_W,
                height: STAGE_H,
                maxWidth: "100%",
              }}
            >
              <span
                className={`env-part${animating ? " env-move-up" : ""}`}
                style={{
                  ...posStyle(envelope.titlePos),
                  zIndex: 5,
                  display: envelope.titlePos && envelope.titlePos.width > 0 ? "flex" : "none",
                  alignItems: "flex-start",
                  justifyContent: envelope.titleStyle?.textAlign === "center" ? "center" : envelope.titleStyle?.textAlign === "right" ? "flex-end" : "flex-start",
                  fontFamily: envelope.titleStyle?.fontFamily ?? "serif",
                  fontStyle: envelope.titleStyle?.fontStyle ?? "italic",
                  fontWeight: envelope.titleStyle?.fontWeight ?? "normal",
                  fontSize: envelope.titleStyle?.fontSize ?? 20,
                  color: envelope.titleStyle?.fill ?? "#2f2f2f",
                  lineHeight: envelope.titleStyle?.lineHeight ?? 1.16,
                }}
              >
                {envelope.titleText}
              </span>

              <span
                className={`env-part${animating ? " env-move-up" : ""}`}
                style={{
                  ...posStyle(envelope.subtitlePos),
                  zIndex: 5,
                  display: envelope.subtitlePos && envelope.subtitlePos.width > 0 ? "flex" : "none",
                  alignItems: "flex-start",
                  justifyContent: envelope.subtitleStyle?.textAlign === "center" ? "center" : envelope.subtitleStyle?.textAlign === "right" ? "flex-end" : "flex-start",
                  fontFamily: envelope.subtitleStyle?.fontFamily ?? "serif",
                  fontStyle: envelope.subtitleStyle?.fontStyle ?? "italic",
                  fontWeight: envelope.subtitleStyle?.fontWeight ?? "normal",
                  fontSize: envelope.subtitleStyle?.fontSize ?? 16,
                  color: envelope.subtitleStyle?.fill ?? "#2f2f2f",
                  lineHeight: envelope.subtitleStyle?.lineHeight ?? 1.16,
                }}
              >
                {envelope.subtitleText}
              </span>

              {envelope.logoSrc && envelope.logoPos && envelope.logoPos.width > 0 && (
                <img
                  className={`env-part${animating ? " env-move-up" : ""}`}
                  src={envelope.logoSrc}
                  alt="logo"
                  style={{ ...posStyle(envelope.logoPos), zIndex: 5 }}
                />
              )}

              <span
                className={`env-part env-press${animating ? " env-move-down" : ""}`}
                style={{
                  ...posStyle(envelope.pressPos),
                  zIndex: 5,
                  display: envelope.pressPos && envelope.pressPos.width > 0 ? "flex" : "none",
                  alignItems: "flex-start",
                  justifyContent: envelope.pressStyle?.textAlign === "center" ? "center" : envelope.pressStyle?.textAlign === "right" ? "flex-end" : "flex-start",
                  fontFamily: envelope.pressStyle?.fontFamily ?? "serif",
                  fontStyle: envelope.pressStyle?.fontStyle ?? "italic",
                  fontWeight: envelope.pressStyle?.fontWeight ?? "normal",
                  fontSize: envelope.pressStyle?.fontSize ?? 14,
                  color: envelope.pressStyle?.fill ?? "#555",
                  lineHeight: envelope.pressStyle?.lineHeight ?? 1.16,
                }}
              >
                {envelope.pressText}
              </span>

              <img
                className={`env-part env-head${animating ? " env-move-up" : ""}`}
                src={envelope.headSrc}
                alt="envelope head"
              />

              <img
                className={`env-part env-seal${animating ? " env-move-up" : ""}`}
                src={envelope.sealSrc}
                alt="seal"
                onClick={handleSealClick}
              />

              <img
                className={`env-part env-body${animating ? " env-move-down" : ""}`}
                src={envelope.bodySrc}
                alt="envelope body"
              />
            </div>
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

      {borderUrl && (
        <img
          src={borderUrl}
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
            zIndex: /bordeline\.svg$/i.test(borderUrl) ? 110 : 10,
            objectFit: "fill",
          }}
        />
      )}

      {musicUrl && (
        <audio
          ref={audioRef}
          src={musicUrl}
          loop
          controls
          style={{ position: "fixed", left: 12, bottom: 80, zIndex: 10 }}
        />
      )}
    </>
  );
}
