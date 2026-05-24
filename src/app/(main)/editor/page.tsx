"use client";

import React, { useRef, useState } from 'react';
import type { EditorHandle } from '@/src/components/CanvasEditor';
import EditorLayoutClient from "../../../components/EditorLayoutClient";
import Sidebar from "@/src/components/canvas-editor/sidebar";
import EditorHeader from "@/src/components/canvas-editor/editor-header";
import '../../globals.css'
import { useRouter } from "next/navigation";
import { EventDataProvider, useEventData } from "@/src/store/EventDataContext";

export default function Page() {
  return (
    <EventDataProvider>
      <EditorPageInner />
    </EventDataProvider>
  );
}

function EditorPageInner() {
  const editorRef = useRef<EditorHandle | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop");
  const [eventName, setEventName] = useState("Bride & Groom");
  const router = useRouter();

  const { eventData } = useEventData();

  return (
    <main className="h-screen overflow-hidden bg-brand-cream">
      <div className="w-full max-w-full mx-auto h-full flex flex-col">

        <EditorHeader
          editorRef={editorRef as React.RefObject<EditorHandle>}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onSave={() => editorRef.current?.save()}
          onPreview={() => {
            editorRef.current?.exportHTML(eventName).then((slug) => router.push(`/e/${slug}`));
          }}
          onPreviewLocal={() => editorRef.current?.previewLocal(eventName)}
          onUpgrade={() => setIsPremium(true)}
          eventName={eventName}
          onEventNameChange={setEventName}
        />

        <div className="flex w-full gap-6 flex-1 min-h-0 overflow-hidden">
          <Sidebar editorRef={editorRef} isPremium={isPremium} isPhonePreview={previewMode === "phone"} />

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
            />
          </div>
        </div>

      </div>
    </main>
  );
}
