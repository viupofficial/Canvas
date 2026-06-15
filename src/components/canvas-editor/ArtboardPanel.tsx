"use client";

import React from "react";
import { GripVertical, FileText } from "lucide-react";
import type { EditorHandle } from "@/src/components/CanvasEditor";

export default function ArtboardPanel({
  pageCount,
  currentPageIndex,
  editorRef,
}: {
  pageCount: number;
  currentPageIndex: number;
  editorRef?: React.RefObject<EditorHandle | null>;
}) {
  const handle = () => editorRef?.current ?? null;

  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  const onDragOverRow = (e: React.DragEvent, index: number) => {
    if (draggingIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    setDropIndex(after ? index + 1 : index);
  };

  const commitDrop = () => {
    if (draggingIndex === null || dropIndex === null) return;
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

  return (
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
              draggable
              onDragStart={(e) => {
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
                  className="shrink-0 flex items-center justify-center text-[#7D5B59]/60 cursor-grab active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  <GripVertical size={15} />
                </span>
                <FileText size={15} className="shrink-0 text-[#7D5B59]" />
                <span className="flex-1 text-[13px] font-[600] text-[#7D5B59]">
                  Page {pageIndex + 1}
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
  );
}
