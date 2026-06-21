"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProjectEditor, { type EditorMode } from "@/src/components/ProjectEditor";
import { LoadingState, ErrorState } from "@/src/components/canvas-states";
import { setCanvasUser, type CanvasUser } from "@/src/lib/userSession";
import {
  getUser,
  loadOrCreateEventDesign,
  parseJsonData,
  canAccessEditor,
  canAccessDesigner,
  num,
  type ViupEvent,
  type ViupDesign,
} from "@/src/lib/viupApi";

// Route guard for the event-bound canvas routes:
//   /editor/e/[slug]?user_id=&event_id=    → mode="editor"
//   /designer/e/[slug]?user_id=&event_id=  → mode="designer-event"
//
// Validates user_id + event_id against PHP (which confirms the event belongs to
// the user), enforces the role for the route, then loads-or-creates the single
// design tied to the event and hands it to the canvas. Never loads all designs.
export default function EventCanvasGuard({ mode }: { mode: EditorMode }) {
  const searchParams = useSearchParams();
  const userId = searchParams.get("user_id");
  const eventId = searchParams.get("event_id");

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<{ title: string; message: string }>({
    title: "",
    message: "",
  });
  const [user, setUser] = useState<CanvasUser | null>(null);
  const [event, setEvent] = useState<ViupEvent | null>(null);
  const [design, setDesign] = useState<ViupDesign | null>(null);

  const isEditor = mode === "editor";

  useEffect(() => {
    let cancelled = false;

    const fail = (title: string, message: string) => {
      if (cancelled) return;
      setError({ title, message });
      setStatus("error");
    };

    async function run() {
      // ── Required link information ──────────────────────────────────────────
      if (!userId || !eventId) {
        return fail(
          "Missing editor link information.",
          "This canvas must be opened from My Event with a valid user and event. Please return to vi-up.com and try again.",
        );
      }

      try {
        // ── User + event (PHP verifies event ownership) ──────────────────────
        const data = await getUser(userId, eventId);
        if (cancelled) return;

        if (!data.success || !data.user) {
          return fail(
            "You do not have permission to access this canvas.",
            data.message || "We could not verify your account.",
          );
        }
        if (!data.event) {
          return fail(
            "Event not found.",
            "This event does not exist or does not belong to your account.",
          );
        }

        // ── Role gate ────────────────────────────────────────────────────────
        const allowed = isEditor
          ? canAccessEditor(data.user)
          : canAccessDesigner(data.user);
        if (!allowed) {
          return fail(
            "You do not have permission to access this canvas.",
            isEditor
              ? "This editor link is for assigned editors only."
              : "Designer access only.",
          );
        }

        // Cache the verified session so shared UI (header/profile) works.
        setCanvasUser(data.user);

        // ── Load or create the design tied to this event ─────────────────────
        const record = await loadOrCreateEventDesign({
          userId,
          eventId,
          event: data.event,
        });
        if (cancelled) return;

        setUser(data.user);
        setEvent(data.event);
        setDesign(record);
        setStatus("ready");
      } catch (e) {
        console.error("[EventCanvasGuard] failed", e);
        fail(
          "Failed to load design",
          (e as Error)?.message || "Something went wrong while loading this canvas.",
        );
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, eventId, isEditor]);

  if (status === "loading") {
    return <LoadingState label="Loading your canvas…" />;
  }

  if (status === "error" || !user || !event || !design) {
    return (
      <ErrorState
        title={error.title || "Unable to open canvas"}
        message={error.message}
        actionHref="https://vi-up.com/MyEvent"
        actionLabel="Go to My Event"
      />
    );
  }

  return (
    <ProjectEditor
      mode={mode}
      user={user}
      event={event}
      design={design}
      userId={num(userId) ?? undefined}
      eventId={num(eventId) ?? undefined}
      designId={design.id}
      templateId={num(event.template_id ?? design.template_id)}
      initialDesignJson={parseJsonData(design.json_data)}
    />
  );
}
