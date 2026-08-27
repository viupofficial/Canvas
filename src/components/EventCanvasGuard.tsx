"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProjectEditor, { type EditorMode } from "@/src/components/ProjectEditor";
import { LoadingState, ErrorState } from "@/src/components/canvas-states";
import { setCanvasUser, type CanvasUser } from "@/src/lib/userSession";
import {
  getUser,
  getDesign,
  extractDesign,
  loadOrCreateEventDesign,
  parseJsonData,
  canAccessDesigner,
  resolveEventAccess,
  num,
  type ViupEvent,
  type ViupDesign,
  type EventAccess,
} from "@/src/lib/viupApi";

// Route guard for the event-bound canvas routes:
//   /editor/e/[slug]?user_id=&event_id=    → mode="editor"
//   /designer/e/[slug]?user_id=&event_id=  → mode="designer-event"
//
// ── ACTOR vs OWNER ──────────────────────────────────────────────────────────
// An event has one canonical OWNER (events.user_id) and may additionally be
// shared with up to three collaborators, all managed on iFastNet. The account
// driving this browser is the ACTOR, and the two are no longer always the same
// person. Nothing here assumes actor === owner, and the actor's identity is
// never swapped for the owner's: `user_id` on every downstream call stays the
// actor's own id.
//
// Access is decided by iFastNet, never here. resolveEventAccess() asks
// check_event_access.php (which authorizes the caller from the PHP session) and
// returns the role plus the capabilities that follow from it. Everything in the
// URL — user_id, the slug, any role-looking parameter — is an untrusted claim;
// the backend verdict is what opens or closes this canvas.
//
// Backward compatibility: when the access endpoint is unavailable,
// resolveEventAccess falls back to the ownership proof Canvas has always used
// (get_user.php returns `event` only for the owner), so owners, designers and
// events with no collaborator rows behave exactly as before.
export default function EventCanvasGuard({ mode }: { mode: EditorMode }) {
  const searchParams = useSearchParams();
  // The actor's id, as claimed by the link. Treated as an identity hint only —
  // it decides which account record to display, never what may be opened.
  const actorUserId = searchParams.get("user_id");
  const eventId = searchParams.get("event_id");
  // Optional: a freshly created project links straight to its design. When
  // present we load it directly; otherwise we fall back to the event's design.
  const designIdParam = searchParams.get("design_id");

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<{ title: string; message: string }>({
    title: "",
    message: "",
  });
  const [user, setUser] = useState<CanvasUser | null>(null);
  const [event, setEvent] = useState<ViupEvent | null>(null);
  const [design, setDesign] = useState<ViupDesign | null>(null);
  const [access, setAccess] = useState<EventAccess | null>(null);

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
      if (!actorUserId || !eventId) {
        return fail(
          "Missing editor link information.",
          "This canvas must be opened from My Event with a valid user and event. Please return to vi-up.com and try again.",
        );
      }

      try {
        // ── Backend-authoritative access check ───────────────────────────────
        // Owner, collaborator and designer all pass here; anyone else — a
        // removed collaborator, or someone who edited event_id in the address
        // bar to point at an event they were never granted — does not.
        const verdict = await resolveEventAccess({
          actorUserId,
          eventId,
          designId: designIdParam,
        });
        if (cancelled) return;

        if (!verdict.allowed) {
          return fail(
            "You do not have permission to access this canvas.",
            verdict.message || "This event is not shared with your account.",
          );
        }

        // ── The actor's own account record ───────────────────────────────────
        // Prefer whatever the access check returned; otherwise look the actor up
        // by their own id. Never the owner's — the header/profile must show the
        // person actually editing.
        let actor: CanvasUser | null = verdict.user ?? null;
        if (!actor) {
          const userRes = await getUser(actorUserId).catch(() => null);
          if (cancelled) return;
          actor = userRes?.user ?? null;
        }
        if (!actor) {
          return fail(
            "You do not have permission to access this canvas.",
            "We could not verify your account.",
          );
        }

        // ── Role gate (designer route only) ──────────────────────────────────
        // /designer/e stays role-3, and now also admits an actor iFastNet has
        // explicitly designated the designer for this event. /editor/e needs no
        // role: the access verdict above is the whole requirement.
        if (!isEditor && !canAccessDesigner(actor) && verdict.role !== "designer") {
          return fail(
            "You do not have permission to access this canvas.",
            "Designer access only.",
          );
        }

        // ── The event record ─────────────────────────────────────────────────
        // The access check may hand it back directly. Otherwise fall back to
        // get_user(actor, event), which only answers for the owner — so if that
        // comes up empty for an authorized collaborator, the backend has not
        // exposed the event to them yet and we stop rather than guess.
        let eventRecord: ViupEvent | null = verdict.event ?? null;
        if (!eventRecord) {
          const withEvent = await getUser(actorUserId, eventId).catch(() => null);
          if (cancelled) return;
          eventRecord = withEvent?.event ?? null;
        }
        if (!eventRecord) {
          return fail(
            "Event not found.",
            "This event could not be loaded for your account. Please try again from My Event.",
          );
        }

        // Cache the verified session so shared UI (header/profile) works.
        setCanvasUser(actor);

        // ── Load the design tied to this event ───────────────────────────────
        // Prefer the explicit design_id from the URL (get_design.php); fall back
        // to the event's design (get_designs.php). The slug is display-only —
        // saving always uses event_id + design_id, never the slug.
        //
        // A design_id in the URL is a claim like any other: it is fetched
        // SCOPED to this event_id, so PHP refuses an id belonging to a different
        // event. That refusal is deliberately left to throw — swallowing it
        // would drop through to the load-or-create path below, where a
        // transient failure could mint a second design for an event that
        // already has one.
        let record: ViupDesign | null = null;
        if (designIdParam) {
          record = extractDesign(await getDesign(actorUserId, designIdParam, eventId));
          if (cancelled) return;
        }
        if (!record) {
          record = await loadOrCreateEventDesign({
            userId: actorUserId,
            eventId,
            event: eventRecord,
            // Only the owner/designer may bring a design into existence. A
            // collaborator with no design to open errors out — it must never
            // become a second design for the same event.
            canCreate: verdict.canCreateDesign,
          });
        }
        if (cancelled) return;
        if (!record) {
          return fail(
            "Failed to load design",
            "We could not open the design for this event.",
          );
        }

        setUser(actor);
        setEvent(eventRecord);
        setDesign(record);
        setAccess(verdict);
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
  }, [actorUserId, eventId, designIdParam, isEditor]);

  if (status === "loading") {
    return <LoadingState label="Loading your canvas…" variant="canvas" />;
  }

  if (status === "error" || !user || !event || !design || !access) {
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
      access={access}
      // The ACTOR's id. Saves are authorized against it; the owner's id is not
      // sent from the browser and events.user_id / designs.user_id never move.
      userId={num(actorUserId) ?? undefined}
      eventId={num(eventId) ?? undefined}
      designId={design.id}
      templateId={num(event.template_id ?? design.template_id)}
      initialDesignJson={parseJsonData(design.json_data)}
    />
  );
}
