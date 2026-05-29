"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHandle } from "@/src/components/CanvasEditor";
import EditorLayoutClient from "@/src/components/EditorLayoutClient";
import Sidebar from "@/src/components/canvas-editor/sidebar";
import EditorHeader from "@/src/components/canvas-editor/editor-header";
import ImageEditorModal from "@/src/components/canvas-editor/ImageEditorModal";
import "@/src/app/globals.css";
import { useRouter } from "next/navigation";
import { EventDataProvider, useEventData } from "@/src/store/EventDataContext";
import { ensureProject, saveProject } from "@/src/lib/projectStorage";

// Where an Apply from the image editor should write the edited result back to.
type ApplyTarget =
  | { kind: "canvas" }
  | { kind: "sidebar"; onReplace: (dataUrl: string) => void };

type SaveStatus = "idle" | "saving" | "saved";

export default function ProjectEditor({ projectId }: { projectId?: string }) {
  return (
    <EventDataProvider>
      {/* Keyed by project so switching projects fully remounts the canvas. */}
      <ProjectEditorInner key={projectId ?? "legacy"} projectId={projectId} />
    </EventDataProvider>
  );
}

function ProjectEditorInner({ projectId }: { projectId?: string }) {
  const editorRef = useRef<EditorHandle | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop");
  const [eventName, setEventName] = useState("Bride & Groom");
  const router = useRouter();

  const { eventData } = useEventData();

  // ── Project load ────────────────────────────────────────────────────────────
  // Read on the client only (localStorage) to avoid hydration mismatch; gate the
  // canvas render until we have the saved data.
  const [loaded, setLoaded] = useState(!projectId);
  const [initialCanvasJson, setInitialCanvasJson] = useState<any | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const project = ensureProject(projectId);
    const cj = project.canvasJson ?? null;
    setInitialCanvasJson(cj);
    if (cj?.eventName) setEventName(cj.eventName);
    setLoaded(true);
  }, [projectId]);

  // ── Project save (manual + debounced autosave) ──────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    if (!projectId) {
      // Legacy / ephemeral editor: keep the old localStorage behaviour.
      editorRef.current?.save();
      return;
    }
    const data = editorRef.current?.getProjectData?.();
    if (!data) return;
    const thumbnail = editorRef.current?.getThumbnail?.() ?? "";
    setSaveStatus("saving");
    try {
      saveProject(projectId, {
        canvasJson: { ...data, eventName },
        thumbnail,
      });
      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (e) {
      console.error("[ProjectEditor] save failed", e);
      setSaveStatus("idle");
    }
  }, [projectId, eventName]);

  // Always call the freshest persist from the debounced timer.
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const handleCanvasChange = useCallback(() => {
    if (!projectId) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => persistRef.current(), 1000);
  }, [projectId]);

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

  const initialPages = projectId ? (initialCanvasJson?.pages ?? [null]) : undefined;
  const initialMusicUrl = projectId ? (initialCanvasJson?.musicUrl ?? null) : null;

  return (
    <main className="h-screen overflow-hidden bg-brand-cream">
      <div className="w-full max-w-full mx-auto h-full flex flex-col">
        <EditorHeader
          editorRef={editorRef as React.RefObject<EditorHandle>}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onSave={persist}
          onPreview={() => {
            editorRef.current?.exportHTML(eventName).then((slug) => router.push(`/e/${slug}`));
          }}
          onPreviewLocal={() => editorRef.current?.previewLocal(eventName)}
          onUpgrade={() => setIsPremium(true)}
          eventName={eventName}
          onEventNameChange={setEventName}
        />

        <div className="flex w-full gap-6 flex-1 min-h-0 overflow-hidden">
          <Sidebar
            editorRef={editorRef}
            isPremium={isPremium}
            isPhonePreview={previewMode === "phone"}
            onEditImage={handleSidebarEditImage}
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
              initialPages={initialPages}
              initialMusicUrl={initialMusicUrl}
            />
          </div>
        </div>
      </div>

      {projectId && saveStatus !== "idle" && (
        <div className="fixed bottom-4 right-4 z-[90] rounded-full bg-white/90 border border-[#EDE2DE] px-4 py-1.5 text-[12px] font-semibold text-[#7D5B59] shadow">
          {saveStatus === "saving" ? "Saving…" : "Saved ✓"}
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
