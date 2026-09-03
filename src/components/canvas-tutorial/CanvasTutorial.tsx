"use client";

// First-run guided walkthrough for the canvas editor.
//
// Purely additive: it renders a dimming overlay, a spotlight around the REAL
// editor controls and an explanation card. It never duplicates a control, never
// clicks one, and touches nothing in Fabric, the design JSON, autosave or any
// other canvas behaviour. Mounting it is one line in ProjectEditor; unmounting
// it leaves the editor exactly as it was.
//
// Completion state lives on iFastNet (users.canvas_tutorial_seen) — see
// useCanvasTutorial.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TUTORIAL_INTRO, TUTORIAL_STEPS, type TutorialPlacement } from "./steps";
import { resolveTargets, scrollTargetsIntoView, unionRect, type Rect } from "./targets";
import { useCanvasTutorial } from "./useCanvasTutorial";

const BRAND = "#7D5B59";
const BRAND_DARK = "#5a2d2d";

// ── Card placement ───────────────────────────────────────────────────────────
const GAP = 14; // space between the spotlight and the card
const EDGE = 10; // minimum distance from the viewport edge

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Where to put the explanation card for a given spotlight, preferring the
 * step's placement and falling back to whichever side actually fits. On a
 * phone, where nothing fits beside a full-width rail, it lands in the largest
 * free band above or below the target.
 */
function placeCard(
  rect: Rect | null,
  cardW: number,
  cardH: number,
  preferred: TutorialPlacement = "right",
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // No target (intro card, or a step whose control vanished): dead centre.
  if (!rect) {
    return {
      top: clamp((vh - cardH) / 2, EDGE, Math.max(EDGE, vh - cardH - EDGE)),
      left: clamp((vw - cardW) / 2, EDGE, Math.max(EDGE, vw - cardW - EDGE)),
    };
  }

  const fits: Record<TutorialPlacement, boolean> = {
    right: rect.left + rect.width + GAP + cardW <= vw - EDGE,
    left: rect.left - GAP - cardW >= EDGE,
    bottom: rect.top + rect.height + GAP + cardH <= vh - EDGE,
    top: rect.top - GAP - cardH >= EDGE,
  };

  const order: TutorialPlacement[] = [preferred, "right", "bottom", "top", "left"];
  const side = order.find((p) => fits[p]);

  if (side === "right" || side === "left") {
    const left = side === "right" ? rect.left + rect.width + GAP : rect.left - GAP - cardW;
    return {
      left,
      top: clamp(
        rect.top + rect.height / 2 - cardH / 2,
        EDGE,
        Math.max(EDGE, vh - cardH - EDGE),
      ),
    };
  }

  if (side === "bottom" || side === "top") {
    const top = side === "bottom" ? rect.top + rect.height + GAP : rect.top - GAP - cardH;
    return {
      top,
      left: clamp(
        rect.left + rect.width / 2 - cardW / 2,
        EDGE,
        Math.max(EDGE, vw - cardW - EDGE),
      ),
    };
  }

  // Nothing fits cleanly (short phone viewport): use the roomier band and let
  // the card's own max-height keep it on screen.
  const spaceAbove = rect.top;
  const spaceBelow = vh - (rect.top + rect.height);
  const left = clamp(
    rect.left + rect.width / 2 - cardW / 2,
    EDGE,
    Math.max(EDGE, vw - cardW - EDGE),
  );
  return spaceAbove >= spaceBelow
    ? { top: clamp(rect.top - GAP - cardH, EDGE, Math.max(EDGE, vh - cardH - EDGE)), left }
    : { top: clamp(rect.top + rect.height + GAP, EDGE, Math.max(EDGE, vh - cardH - EDGE)), left };
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1);

// ── Overlay ──────────────────────────────────────────────────────────────────
type OverlayProps = ReturnType<typeof useCanvasTutorial>;

function TutorialOverlay(props: OverlayProps) {
  const {
    phase,
    stepIndex,
    totalSteps,
    saving,
    saveError,
    start,
    next,
    back,
    skip,
    finish,
    dismissWithoutSaving,
  } = props;

  const step = phase === "running" ? TUTORIAL_STEPS[stepIndex] : null;
  const isLastStep = stepIndex === totalSteps - 1;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ width: 320, height: 200 });
  // Re-render on viewport changes so the card is re-placed even on the intro
  // step, which has no target rect to drive a measurement.
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // ── Track the real control's box ────────────────────────────────────────────
  // Re-measured on resize/scroll and on a slow interval, so the spotlight keeps
  // up with rail scrolling, orientation changes and any late layout shift
  // without holding a rAF loop open.
  useEffect(() => {
    // No target on the intro card — `spotlight` below ignores any stale rect
    // rather than this effect writing state on the way in.
    if (!step) return;

    scrollTargetsIntoView(resolveTargets(step.selectors));

    let frame = 0;
    const measure = () => {
      const next = unionRect(resolveTargets(step.selectors));
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };

    measure();
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const interval = setInterval(measure, 300);

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    // Capture phase: the rails are their own scrollers, not the window.
    window.addEventListener("scroll", schedule, true);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step]);

  // Card size feeds the placement maths; measure it after every content change.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setCardSize((prev) =>
        Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1
          ? prev
          : { width: r.width, height: r.height },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, stepIndex, saveError, saving]);

  // Keyboard nav. Escape is deliberately inert: leaving the tour is an explicit
  // Skip/Finish click, because those are what write to the database.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "running") return;
      if (e.key === "ArrowRight" && !isLastStep) {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, isLastStep, next, back]);

  useEffect(() => {
    cardRef.current?.focus?.();
  }, [phase, stepIndex]);

  // The intro card has no target; a running step whose control has since gone
  // (a rail scrolled away mid-tour) also falls back to a centred card rather
  // than pointing at nothing.
  const spotlight = step ? rect : null;
  const cardW = Math.max(220, Math.min(340, viewport.width - 2 * EDGE));
  const pos =
    typeof window === "undefined"
      ? { top: 0, left: 0 }
      : placeCard(spotlight, cardW, cardSize.height, step?.placement);

  const busy = saving;

  return (
    <div
      className="fixed inset-0 z-[1500] pointer-events-none font-[Montserrat]"
      data-tutorial-overlay=""
    >
      {/* Click shield. The tour is informational, so the canvas underneath is
          intentionally inert until the user finishes or skips. */}
      <div className="absolute inset-0 pointer-events-auto" aria-hidden="true" />

      {/* Dimmer. With a target, one huge box-shadow dims everything EXCEPT the
          real control, so the highlight is the control itself — never a copy. */}
      {spotlight ? (
        <div
          className="absolute rounded-[14px] pointer-events-none transition-all duration-200 ease-out"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(31, 20, 20, 0.58)",
            outline: "2px solid rgba(255,255,255,0.9)",
            outlineOffset: "1px",
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(31,20,20,0.58)] pointer-events-none" aria-hidden="true" />
      )}

      {/* Explanation card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-tutorial-title"
        tabIndex={-1}
        className="absolute pointer-events-auto bg-white rounded-[20px] shadow-[0_12px_40px_rgba(0,0,0,0.28)] p-4 pc:p-5 outline-none overflow-y-auto"
        style={{
          top: pos.top,
          left: pos.left,
          width: cardW,
          maxHeight: `calc(100vh - ${2 * EDGE}px)`,
        }}
      >
        {step ? (
          <>
            {/* Progress — "2 of 6" plus a dot per step. */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: `${BRAND}99` }}>
                {stepIndex + 1} of {totalSteps}
              </span>
              <span className="flex items-center gap-1" aria-hidden="true">
                {TUTORIAL_STEPS.map((s, i) => (
                  <span
                    key={s.id}
                    className="h-1.5 rounded-full transition-all duration-200"
                    style={{
                      width: i === stepIndex ? 16 : 6,
                      backgroundColor: i <= stepIndex ? BRAND : "#E3D5D2",
                    }}
                  />
                ))}
              </span>
            </div>

            <h2
              id="canvas-tutorial-title"
              className="text-[17px] pc:text-[19px] font-bold leading-snug mb-1.5"
              style={{ color: "#191212" }}
            >
              {step.title}
            </h2>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: `${BRAND}CC` }}>
              {step.body}
            </p>
          </>
        ) : (
          <>
            <h2
              id="canvas-tutorial-title"
              className="text-[19px] pc:text-[22px] font-bold leading-snug mb-2"
              style={{ color: "#191212" }}
            >
              {TUTORIAL_INTRO.title}
            </h2>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: `${BRAND}CC` }}>
              {TUTORIAL_INTRO.body}
            </p>
          </>
        )}

        {/* Completion failure. Nothing was persisted, so we say so and offer a
            retry rather than pretending the tutorial is permanently done. */}
        {saveError && (
          <p
            role="alert"
            className="mb-3 rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[12px] font-semibold text-[#B23B3B]"
          >
            {saveError} Your progress wasn&apos;t saved — please try again.
          </p>
        )}

        {step ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={back}
              disabled={busy}
              className="rounded-full border px-4 py-2 text-[13px] font-bold disabled:opacity-40"
              style={{ borderColor: "#EDE2DE", color: BRAND }}
            >
              Back
            </button>

            <button
              type="button"
              onClick={isLastStep ? finish : next}
              disabled={busy}
              className="rounded-full px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: BRAND_DARK }}
            >
              {isLastStep
                ? busy
                  ? "Saving…"
                  : saveError
                  ? "Retry"
                  : "Finish Tutorial"
                : "Next"}
            </button>

            <button
              type="button"
              onClick={saveError ? dismissWithoutSaving : skip}
              disabled={busy}
              className="ml-auto text-[12px] font-semibold underline underline-offset-2 disabled:opacity-40"
              style={{ color: `${BRAND}99` }}
            >
              {saveError ? "Close for now" : "Skip Tutorial"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-stretch gap-2">
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="rounded-full px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: BRAND_DARK }}
            >
              {TUTORIAL_INTRO.startLabel}
            </button>
            <button
              type="button"
              onClick={saveError ? dismissWithoutSaving : skip}
              disabled={busy}
              className="text-[12px] font-semibold underline underline-offset-2 disabled:opacity-40"
              style={{ color: `${BRAND}99` }}
            >
              {busy ? "Saving…" : saveError ? "Close for now" : TUTORIAL_INTRO.skipLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────
export default function CanvasTutorial({
  userId,
  enabled = true,
}: {
  /** Authenticated actor id (EventCanvasGuard verified it). */
  userId?: number | null;
  /** False on teaser/legacy canvases — no account, so nothing to record. */
  enabled?: boolean;
}) {
  const tutorial = useCanvasTutorial({ userId, enabled });

  // Nothing rendered — and nothing measured — until the tour is actually open.
  if (tutorial.phase === "idle") return null;
  return <TutorialOverlay {...tutorial} />;
}

// Re-exported so a future "Help → Replay Tutorial" control can fire the tour
// from anywhere: window.dispatchEvent(new Event(TUTORIAL_REPLAY_EVENT)).
export { TUTORIAL_REPLAY_EVENT, useCanvasTutorial } from "./useCanvasTutorial";
