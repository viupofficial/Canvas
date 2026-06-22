"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHandle } from "@/src/components/CanvasEditor";
import EditorLayoutClient from "@/src/components/EditorLayoutClient";
import Sidebar from "@/src/components/canvas-editor/sidebar";
import EditorHeader from "@/src/components/canvas-editor/editor-header";
import ImageEditorModal from "@/src/components/canvas-editor/ImageEditorModal";
import "@/src/app/globals.css";
import { useRouter } from "next/navigation";
import { EventDataProvider, useEventData, type EventData } from "@/src/store/EventDataContext";
import { ensureProject, saveProject } from "@/src/lib/projectStorage";
import { getCanvasUser } from "@/src/lib/userSession";
import { updateDesign, updateEventTitle, getCanvasName, num, type ViupEvent, type ViupDesign } from "@/src/lib/viupApi";
import type { CanvasUser } from "@/src/lib/userSession";

const API_BASE = "https://vi-up.com/api";

// Editor experiences:
//  - "editor"         → staff/client editing one purchased event. Locked to the
//                       event: no dashboard/back/create. Logo → vi-up.com/MyEvent.
//  - "designer"       → legacy free editor (localStorage / project-id flows).
//  - "designer-event" → designer editing a specific event, but keeps dashboard nav.
export type EditorMode = "editor" | "designer" | "designer-event";

// Where an Apply from the image editor should write the edited result back to.
type ApplyTarget =
  | { kind: "canvas" }
  | { kind: "sidebar"; onReplace: (dataUrl: string) => void };

type SaveStatus = "idle" | "saving" | "saved";

export type ProjectEditorProps = {
  // Legacy project-id flow (localStorage + best-effort DB mirror).
  projectId?: string;
  teaser?: boolean;

  // Event-based flow (editor / designer-event). When `mode` is set and an
  // eventId is present, the canvas is bound to a single DB design record.
  mode?: EditorMode;
  userId?: number;
  eventId?: number;
  designId?: number;
  templateId?: number | null;
  user?: CanvasUser | null;
  event?: ViupEvent | null;
  design?: ViupDesign | null;
  // Decoded json_data from the design record: { version, eventData, canvas }.
  initialDesignJson?: any;
};

export default function ProjectEditor(props: ProjectEditorProps) {
  const { projectId, mode, designId, initialDesignJson } = props;
  // Event-based flows seed the event data from the DB record instead of
  // localStorage.
  const seededEventData: Partial<EventData> | null =
    mode && mode !== "designer"
      ? (initialDesignJson?.eventData ?? null)
      : null;

  // Remount the whole editor when the underlying record changes so the canvas
  // fully re-initialises (per-project or per-design).
  const remountKey = designId != null ? `design-${designId}` : projectId ?? "legacy";

  return (
    <EventDataProvider initialEventData={seededEventData}>
      <ProjectEditorInner key={remountKey} {...props} />
    </EventDataProvider>
  );
}

function ProjectEditorInner({
  projectId,
  teaser,
  mode,
  userId,
  eventId,
  designId,
  templateId,
  event,
  initialDesignJson,
}: ProjectEditorProps) {
  const editorRef = useRef<EditorHandle | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop");
  // Bumped whenever the active page's content is (re)loaded — the Background panel
  // watches this to re-read and display the current page's background.
  const [bgReadNonce, setBgReadNonce] = useState(0);
  const router = useRouter();

  const { eventData } = useEventData();

  // Is this canvas bound to a single DB event/design?
  const isEventMode = !!mode && mode !== "designer" && designId != null && eventId != null;

  const initialEventName =
    (isEventMode
      ? initialDesignJson?.canvas?.eventName || getCanvasName(event)
      : undefined) ?? "Bride & Groom";
  const [eventName, setEventName] = useState(initialEventName);

  // ── Initial canvas data ──────────────────────────────────────────────────
  // Event mode hydrates from the DB record; legacy project-id flow reads the
  // localStorage copy on the client (gated to avoid hydration mismatch).
  const [loaded, setLoaded] = useState(isEventMode || !projectId);
  const [initialCanvasJson, setInitialCanvasJson] = useState<any | null>(
    isEventMode ? (initialDesignJson?.canvas ?? null) : null,
  );

  useEffect(() => {
    if (isEventMode || !projectId) return;
    const project = ensureProject(projectId);
    const cj = project.canvasJson ?? null;
    setInitialCanvasJson(cj);
    if (cj?.eventName) setEventName(cj.eventName);
    setLoaded(true);
  }, [projectId, isEventMode]);

  // ── Save (manual + debounced autosave) ───────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `syncTitle` is only true for a manual Save: that's when we push the canvas
  // title back to events.event_name (the MyEvent card). Autosave never touches
  // the event title — it would fire on every canvas edit.
  const persist = useCallback(
    (opts?: { syncTitle?: boolean }) => {
    const syncTitle = !!opts?.syncTitle;
    const data = editorRef.current?.getProjectData?.();
    const thumbnail = editorRef.current?.getThumbnail?.() ?? "";

    // ── Event-bound save → always scoped to this event/design ──────────────
    if (isEventMode) {
      if (!data) return;

      const cleanTitle = String(eventName || "").trim();

      // Manual save validation — designId/eventId are guaranteed by isEventMode,
      // but the title must not be blank when we're syncing it to MyEvent.
      if (syncTitle && !cleanTitle) {
        setSaveError("Title cannot be empty.");
        return;
      }

      setSaveError("");
      setSaveStatus("saving");
      const json_data = {
        version: 1,
        eventData,
        canvas: { ...data, eventName: cleanTitle || eventName },
      };

      // Save the event title first (manual save only), then the design. We must
      // send BOTH user_id and event_id — never update the title by user_id alone.
      const titleStep =
        syncTitle && eventId != null && userId != null
          ? updateEventTitle({ userId, eventId, title: cleanTitle }).catch((e) => {
              console.error("[ProjectEditor] event title update failed", e);
              throw new Error("Failed to update event title.");
            })
          : Promise.resolve();

      titleStep
        .then(() =>
          updateDesign({
            user_id: num(userId),
            event_id: num(eventId),
            design_id: num(designId),
            name: cleanTitle || getCanvasName(event),
            json_data,
            preview_url: thumbnail || null,
            status: "draft",
          }).catch((e) => {
            console.error("[ProjectEditor] design save failed", e);
            // The title may already have been updated — be explicit about it.
            throw new Error(
              syncTitle
                ? "Title updated, but design save failed. Please save again."
                : (e as Error)?.message || "Failed to save.",
            );
          }),
        )
        .then(() => {
          if (syncTitle) setEventName(cleanTitle);
          setSaveStatus("saved");
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
        })
        .catch((e) => {
          console.error("[ProjectEditor] event save failed", e);
          setSaveStatus("idle");
          setSaveError((e as Error)?.message || "Failed to save.");
        });
      return;
    }

    // ── Legacy ephemeral editor (no project id) ────────────────────────────
    if (!projectId) {
      editorRef.current?.save();
      return;
    }

    // ── Legacy project-id flow: localStorage + best-effort DB mirror ───────
    if (!data) return;
    setSaveStatus("saving");
    try {
      saveProject(projectId, { canvasJson: { ...data, eventName }, thumbnail });
    } catch (e) {
      console.error("[ProjectEditor] local save failed", e);
    }

    const user = getCanvasUser();
    if (!user) {
      console.warn("[ProjectEditor] no viup_canvas_user — skipping DB save");
      setSaveStatus("idle");
      return;
    }

    const json_data = { version: 1, eventData, canvas: { ...data, eventName } };
    fetch(`${API_BASE}/update_design.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design_id: Number(projectId), user_id: user.id, json_data }),
    })
      .then((res) => res.json())
      .then(() => {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
      })
      .catch((e) => {
        console.error("[ProjectEditor] DB save failed", e);
        setSaveStatus("idle");
      });
    },
    [isEventMode, projectId, eventName, eventData, userId, eventId, designId, event],
  );

  // Always call the freshest persist from the debounced timer.
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Autosave applies to any record-backed canvas (event or project id).
  const autosaveEnabled = isEventMode || !!projectId;
  const handleCanvasChange = useCallback(() => {
    if (!autosaveEnabled) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => persistRef.current(), 1000);
  }, [autosaveEnabled]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ── Image editor state ──────────────────────────────────────────────────────
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [selectedImageForEditing, setSelectedImageForEditing] = useState<string | null>(null);
  const [editorCropMode, setEditorCropMode] = useState(false);
  const originalImageReference = useRef<ApplyTarget | null>(null);

  const openImageEditor = (src: string, target: ApplyTarget, crop = false) => {
    originalImageReference.current = target;
    setSelectedImageForEditing(src);
    setEditorCropMode(crop);
    setImageEditorOpen(true);
  };

  const closeImageEditor = () => {
    setImageEditorOpen(false);
    setSelectedImageForEditing(null);
    setEditorCropMode(false);
    originalImageReference.current = null;
  };

  const handleCanvasEditImage = (src: string, opts?: { crop?: boolean }) => {
    openImageEditor(src, { kind: "canvas" }, !!opts?.crop);
  };

  const handleSidebarEditImage = (src: string, onReplace: (dataUrl: string) => void) => {
    openImageEditor(src, { kind: "sidebar", onReplace });
  };

  const handleApplyEditedImage = (dataUrl: string) => {
    const target = originalImageReference.current;
    if (target?.kind === "canvas") {
      editorRef.current?.replaceActiveImage(dataUrl);
    } else if (target?.kind === "sidebar") {
      target.onReplace(dataUrl);
    }
    closeImageEditor();
  };

  if (!loaded) {
    return (
      <main className="h-screen flex items-center justify-center bg-brand-cream text-[#7D5B59]">
        Loading project…
      </main>
    );
  }

  // Logo / "home" target depends on the experience:
  //  - editor: locked out of the app — return to the My Event page on vi-up.com.
  //  - designer / designer-event: back to the designer dashboard.
  //  - legacy: let EditorHeader's own path-based rule decide.
  const homeHref =
    mode === "editor"
      ? "https://vi-up.com/MyEvent"
      : mode === "designer" || mode === "designer-event"
      ? userId != null
        ? `/designer?user_id=${userId}`
        : "/"
      : undefined;

  const showRecordSaveStatus = isEventMode || !!projectId;

  const initialPages = isEventMode || projectId ? (initialCanvasJson?.pages ?? [null]) : undefined;
  const initialMusicUrl = isEventMode || projectId ? (initialCanvasJson?.musicUrl ?? null) : null;

  return (
    <main className="h-screen overflow-hidden bg-brand-cream">
      <div className="w-full max-w-full mx-auto h-full flex flex-col">
        <EditorHeader
          editorRef={editorRef as React.RefObject<EditorHandle>}
          mode={mode}
          homeHref={homeHref}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onSave={() => persist({ syncTitle: true })}
          onPreview={() => {
            editorRef.current?.exportHTML(eventName).then((slug) => router.push(`/e/${slug}`));
          }}
          onPreviewLocal={() => editorRef.current?.previewLocal(eventName)}
          teaser={teaser}
          onLogin={() => { window.location.href = "https://vi-up.com/login"; }}
          eventName={eventName}
          onEventNameChange={(name: string) => {
            // Update local state immediately; the title is only pushed to PHP on
            // a manual Save, so just clear any stale error here.
            setEventName(name);
            if (saveError) setSaveError("");
          }}
        />

        <div className="flex w-full gap-6 flex-1 min-h-0 overflow-hidden">
          <Sidebar
            editorRef={editorRef}
            isPhonePreview={previewMode === "phone"}
            onEditImage={handleSidebarEditImage}
            bgReadNonce={bgReadNonce}
          />

          <div className="flex-1 min-w-0">
            <EditorLayoutClient
              editorRef={editorRef}
              contacts={eventData.contacts}
              moneyGift={eventData.moneyGift}
              calendar={eventData.calendar}
              location={eventData.location}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              eventName={eventName}
              onEditImage={handleCanvasEditImage}
              onCanvasChange={handleCanvasChange}
              onContentReplaced={() => setBgReadNonce((n) => n + 1)}
              initialPages={initialPages}
              initialMusicUrl={initialMusicUrl}
            />
          </div>
        </div>
      </div>

      {showRecordSaveStatus && saveStatus !== "idle" && (
        <div className="fixed bottom-4 right-4 z-[90] rounded-full bg-white/90 border border-[#EDE2DE] px-4 py-1.5 text-[12px] font-semibold text-[#7D5B59] shadow">
          {saveStatus === "saving" ? "Saving…" : "Saved ✓"}
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[90] max-w-xs rounded-lg bg-[#FDECEC] border border-[#F3B6B6] px-4 py-2 text-[12px] font-semibold text-[#B23B3B] shadow"
        >
          {saveError}
        </div>
      )}

      {imageEditorOpen && selectedImageForEditing && (
        <ImageEditorModal
          imageSrc={selectedImageForEditing}
          startInCrop={editorCropMode}
          onCancel={closeImageEditor}
          onApply={handleApplyEditedImage}
        />
      )}
    </main>
  );
}
