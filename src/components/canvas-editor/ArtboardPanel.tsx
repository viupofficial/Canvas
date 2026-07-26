"use client";

import React from "react";
import { GripVertical, FileText } from "lucide-react";
import type { EditorHandle } from "@/src/components/CanvasEditor";
import {
  DEFAULT_PRESENTATION_MODE,
  type PresentationMode,
} from "@/src/lib/presentationMode";

export default function ArtboardPanel({
  pageCount,
  currentPageIndex,
  editorRef,
  presentationMode = DEFAULT_PRESENTATION_MODE,
}: {
  pageCount: number;
  currentPageIndex: number;
  editorRef?: React.RefObject<EditorHandle | null>;
  presentationMode?: PresentationMode;
}) {
  const handle = () => editorRef?.current ?? null;

  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  // The envelope page is always at index 0 and cannot be moved
  const isEnvelopePage = (index: number) => index === 0;
  const canDragPage = (index: number) => !isEnvelopePage(index);

  const onDragOverRow = (e: React.DragEvent, index: number) => {
    if (draggingIndex === null) return;
    // Prevent dropping on or near the envelope page
    if (isEnvelopePage(index) || isEnvelopePage(draggingIndex)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    setDropIndex(after ? index + 1 : index);
  };

  const commitDrop = () => {
    if (draggingIndex === null || dropIndex === null) return;
    // Safety check: prevent envelope page movement
    if (isEnvelopePage(draggingIndex) || isEnvelopePage(dropIndex)) {
      setDraggingIndex(null);
      setDropIndex(null);
      return;
    }
    let to = dropIndex;
    if (to > draggingIndex) to -= 1;
    if (to !== draggingIndex) {
      handle()?.reorderPages(draggingIndex, to);
    }
  };

  if (pageCount === 0) {
    return (
      <div className="p-4 text-sm text-neutral-500">No pages yet.</div>
    );
  }

  const iconBtn =
    "shrink-0 h-7 w-7 rounded-[8px] flex items-center justify-center text-[#7D5B59] hover:bg-[#EDE2DE] transition-colors";

  const dropLine = <div className="h-0.5 -my-0.5 rounded-full bg-[#7D5B59]" />;

  const scrollOn = presentationMode === "scroll";

  return (
    <>
      {/* ── Presentation ────────────────────────────────────────────────────
          Controls the preview / published invitation only. The editor canvas
          below stays page-by-page whatever this is set to. */}
      <div className="border-b border-[#EDE2DE] p-3">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <button
            type="button"
            role="switch"
            aria-checked={scrollOn}
            onClick={() =>
              handle()?.setPresentationMode(scrollOn ? "page" : "scroll")
            }
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
              scrollOn ? "bg-[#7D5B59]" : "bg-[#D9C9C5]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] ${
                scrollOn ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-[600] text-[#7D5B59]">
              Continuous Scroll
            </span>
            <span className="text-[11px] leading-snug text-[#7D5B59]/60">
              Display all invitation pages as one continuous scrolling
              experience.
            </span>
          </span>
        </label>
      </div>

      <div
        className="flex flex-col gap-1 p-2"
        onDragOver={(e) => { if (draggingIndex !== null) e.preventDefault(); }}
      >
      {Array.from({ length: pageCount }, (_, i) => i).map((pageIndex) => {
        const isActive = pageIndex === currentPageIndex;
        const isDragging = pageIndex === draggingIndex;
        return (
          <React.Fragment key={pageIndex}>
            {dropIndex === pageIndex && dropLine}
            <div
              draggable={canDragPage(pageIndex)}
              onDragStart={(e) => {
                if (!canDragPage(pageIndex)) return;
                setDraggingIndex(pageIndex);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(pageIndex));
              }}
              onDragOver={(e) => onDragOverRow(e, pageIndex)}
              onDrop={(e) => {
                e.preventDefault();
                commitDrop();
                setDraggingIndex(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDraggingIndex(null);
                setDropIndex(null);
              }}
              onClick={() => handle()?.goToPage(pageIndex)}
              className={`group rounded-[10px] border px-2 py-2.5 cursor-pointer select-none transition-opacity ${
                isDragging ? "opacity-40" : ""
              } ${
                isActive
                  ? "bg-[#F2E8E6] border-[#7D5B59]"
                  : "bg-[#F2E8E6B2] border-[#EDE2DE] hover:border-[#7D5B59]/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`shrink-0 flex items-center justify-center text-[#7D5B59]/60 ${
                    canDragPage(pageIndex) ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-30"
                  }`}
                  title={canDragPage(pageIndex) ? "Drag to reorder" : "Envelope page cannot be reordered"}
                >
                  <GripVertical size={15} />
                </span>
                <FileText size={15} className="shrink-0 text-[#7D5B59]" />
                <span className="flex-1 text-[13px] font-[600] text-[#7D5B59]">
                  Page {pageIndex + 1}
                  {isEnvelopePage(pageIndex) && (
                    <span className="ml-2 text-[10px] font-[600] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                      Envelope
                    </span>
                  )}
                </span>
                {isActive && (
                  <span className="text-[10px] font-[600] text-[#7D5B59]/60 bg-[#7D5B59]/10 px-1.5 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
            </div>
            {pageIndex === pageCount - 1 && dropIndex === pageCount && dropLine}
          </React.Fragment>
        );
      })}
      </div>
    </>
  );
}
