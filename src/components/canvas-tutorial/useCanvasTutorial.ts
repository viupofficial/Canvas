"use client";

// State machine for the first-run canvas walkthrough.
//
// ── Source of truth ─────────────────────────────────────────────────────────
// users.canvas_tutorial_seen on iFastNet, read and written through the shared
// viupApi helpers. Nothing about completion is kept in localStorage,
// sessionStorage or the design JSON — a refresh before finishing must show the
// tutorial again, exactly as the database still says 0.
//
// ── Never breaks the canvas ─────────────────────────────────────────────────
// The status read is fire-and-forget: the editor mounts and works normally
// while it is in flight, and an unknown answer (endpoint missing, offline)
// simply means no tutorial this session. The completion write is the only call
// that surfaces an error, and it does so inside the overlay as a retry.

import { useCallback, useEffect, useRef, useState } from "react";
import { getCanvasTutorialSeen, markCanvasTutorialSeen } from "@/src/lib/viupApi";
import { TUTORIAL_STEPS } from "./steps";
import { waitForTargets } from "./targets";

/** Fired on `window` to replay the tour manually (e.g. a future Help menu). */
export const TUTORIAL_REPLAY_EVENT = "viup:canvas-tutorial-replay";

export type TutorialPhase = "idle" | "intro" | "running";

export type UseCanvasTutorial = {
  phase: TutorialPhase;
  /** 0-based index into TUTORIAL_STEPS while phase === "running". */
  stepIndex: number;
  totalSteps: number;
  /** True while the completion write is in flight. */
  saving: boolean;
  /** Set when marking the tutorial as seen failed — the overlay offers a retry. */
  saveError: string;
  start: () => void;
  next: () => void;
  back: () => void;
  /** "Skip Tutorial" — explicit user action, persists canvas_tutorial_seen = 1. */
  skip: () => void;
  /** "Finish Tutorial" — explicit user action, persists canvas_tutorial_seen = 1. */
  finish: () => void;
  /** Close locally after a failed write, WITHOUT claiming it was saved. */
  dismissWithoutSaving: () => void;
  /** Manual replay. Runs the tour again and never writes to the database. */
  replay: () => void;
};

export function useCanvasTutorial({
  userId,
  enabled = true,
}: {
  /** The authenticated ACTOR's id, as verified by EventCanvasGuard. */
  userId?: number | null;
  /** False for teaser/legacy canvases, which have no account to record against. */
  enabled?: boolean;
}): UseCanvasTutorial {
  const [phase, setPhase] = useState<TutorialPhase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // True once the backend says this user has completed/skipped the tour. A
  // manual replay runs with this still true, which is exactly what keeps the
  // replay from writing to the database again.
  const alreadySeenRef = useRef(false);
  // Guards against the auto-launch firing twice (React strict mode, re-renders).
  const autoLaunchedRef = useRef(false);

  const totalSteps = TUTORIAL_STEPS.length;

  // ── Auto-launch ───────────────────────────────────────────────────────────
  // Ask the backend, then wait for the real controls to exist before opening.
  // Both halves are cancellable so unmounting mid-flight leaves nothing behind.
  useEffect(() => {
    if (!enabled || userId == null) return;
    if (autoLaunchedRef.current) return;

    let cancelled = false;
    let waiter: { cancel: () => void } | null = null;

    (async () => {
      const seen = await getCanvasTutorialSeen(userId);
      if (cancelled) return;

      // null = unknown (API unavailable). Do nothing: an outage must not push
      // the tour at customers who already dismissed it.
      if (seen !== false) {
        alreadySeenRef.current = seen === true;
        return;
      }

      // canvas_tutorial_seen = 0 → show it, but only once the editor is mounted
      // and every control the tour points at is actually in the DOM.
      const wait = waitForTargets(TUTORIAL_STEPS.map((s) => s.selectors));
      waiter = wait;
      const ready = await wait.promise;
      if (cancelled || !ready) return;

      autoLaunchedRef.current = true;
      setStepIndex(0);
      setPhase("intro");
    })().catch((e) => {
      // Belt and braces — getCanvasTutorialSeen already swallows its own errors.
      console.error("[canvas-tutorial] launch check failed", e);
    });

    return () => {
      cancelled = true;
      waiter?.cancel();
    };
  }, [enabled, userId]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    setStepIndex(0);
    setPhase("running");
  }, []);

  const back = useCallback(() => {
    setSaveError("");
    setStepIndex((i) => {
      if (i <= 0) {
        setPhase("intro");
        return 0;
      }
      return i - 1;
    });
  }, []);

  // ── Completion ────────────────────────────────────────────────────────────
  // The ONLY place canvas_tutorial_seen is written, and only from an explicit
  // Finish/Skip click. A replay (alreadySeenRef) closes without touching it.
  const complete = useCallback(async () => {
    if (userId == null || alreadySeenRef.current) {
      setPhase("idle");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await markCanvasTutorialSeen(userId);
      alreadySeenRef.current = true;
      setPhase("idle");
    } catch (e) {
      console.error("[canvas-tutorial] failed to mark as seen", e);
      // Stay open and honest: nothing was persisted, so the tour will reappear
      // on the next load unless the retry succeeds.
      setSaveError(
        (e as Error)?.message || "We couldn't save your progress. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [userId]);

  const skip = useCallback(() => {
    void complete();
  }, [complete]);

  const finish = useCallback(() => {
    void complete();
  }, [complete]);

  const next = useCallback(() => {
    setSaveError("");
    setStepIndex((i) => {
      if (i >= totalSteps - 1) return i; // Last step: Finish handles the exit.
      return i + 1;
    });
  }, [totalSteps]);

  const dismissWithoutSaving = useCallback(() => {
    setSaveError("");
    setPhase("idle");
  }, []);

  // ── Manual replay ─────────────────────────────────────────────────────────
  // Purely local: it never resets canvas_tutorial_seen to 0, and finishing a
  // replay writes nothing back (see complete()).
  const replay = useCallback(() => {
    setSaveError("");
    setStepIndex(0);
    setPhase("intro");
  }, []);

  // Any future "Help → Replay Tutorial" control can start the tour from
  // anywhere in the tree with:
  //   window.dispatchEvent(new Event(TUTORIAL_REPLAY_EVENT))
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onReplay = () => replay();
    window.addEventListener(TUTORIAL_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TUTORIAL_REPLAY_EVENT, onReplay);
  }, [replay]);

  return {
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
    replay,
  };
}
