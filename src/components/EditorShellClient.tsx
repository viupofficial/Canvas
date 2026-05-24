"use client";
//this one is the navar betul2 dekat atas
import React, { useRef } from "react";
import CanvasEditor, { EditorHandle } from "./CanvasEditor";

export default function EditorShellClient({ onSelectionChange }: { onSelectionChange?: (obj: any | null) => void }) {
  const editorRef = useRef<EditorHandle | null>(null);

  return (
    <section className="bg-white border rounded-lg shadow-sm flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex gap-2">
          <button
            className="px-3 py-1 bg-brand-brown text-brand-light rounded"
            onClick={() => editorRef.current?.undo()}
          >
            Undo
          </button>
          <button
            className="px-3 py-1 bg-brand-brown text-brand-light rounded"
            onClick={() => editorRef.current?.redo()}
          >
            Redo
          </button>
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-1 bg-brand-accent text-brand-dark rounded"
            onClick={() => editorRef.current?.save()}
          >
            Save
          </button>
          <button
            className="px-3 py-1 bg-brand-dark text-brand-light rounded"
            onClick={() => editorRef.current?.exportHTML()}
          >
            Export
          </button>
        </div>
      </div>

      <div className="p-4 flex-1">
        <CanvasEditor ref={editorRef} onSelectionChange={onSelectionChange} />
      </div>
    </section>
  );
}
