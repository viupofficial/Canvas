"use client";
//ni betul betul atas canva
import React, { useRef, useState } from "react";
import CanvasEditor, { EditorHandle } from "./CanvasEditor";
import Inspector from "./canvas-editor/inspector";
import PhonePreviewWrapper from "./canvas-editor/PhonePreviewWrapper";
import { Monitor, Smartphone } from "lucide-react";


export default function EditorLayoutClient({
  editorRef: editorRefProp,
  contacts,
  moneyGift,
  calendar,
  location,
  previewMode: previewModeProp,
  setPreviewMode: setPreviewModeProp,
  eventName,
  onEditImage,
  onCanvasChange,
  initialPages,
  initialMusicUrl,
}: {
  editorRef?: React.RefObject<EditorHandle | null>,
  contacts: any[];
  moneyGift: any;
  calendar: any;
  location: any;
  previewMode?: "desktop" | "phone";
  setPreviewMode?: (mode: "desktop" | "phone") => void;
  eventName?: string;
  onEditImage?: (src: string, opts?: { crop?: boolean }) => void;
  onCanvasChange?: () => void;
  initialPages?: any[] | null;
  initialMusicUrl?: string | null;
}) {
  const internalRef = useRef<EditorHandle | null>(null);
  const editorRef = editorRefProp ?? internalRef;
  const [selected, setSelected] = useState<any | null>(null);
  const [internalPreviewMode, setInternalPreviewMode] = useState<"desktop" | "phone">("desktop");

  const previewMode = previewModeProp ?? internalPreviewMode;
  const setPreviewMode = setPreviewModeProp ?? setInternalPreviewMode;

  const onSelectionChange = (obj: any | null) => {
    setSelected(obj);
  };

  const updateSelected = (patch: Record<string, any>) => {
    editorRef.current?.updateActiveObject(patch);
    const obj = editorRef.current?.getActiveObject() ?? null;
    setSelected(obj);
  };

  const canvas = (
    <CanvasEditor
      ref={editorRef}
      onSelectionChange={onSelectionChange}
      onEditImage={onEditImage}
      onCanvasChange={onCanvasChange}
      initialPages={initialPages}
      initialMusicUrl={initialMusicUrl}
      contacts={contacts}
      moneyGift={moneyGift}
      calendar={calendar}
      location={location}
    />
  );

  const inputCls =
    "w-full rounded-[100px] px-[10px] py-[6px] text-[13px] text-[#7D5B59] font-[600] bg-[#F2E8E6B2] outline-none";
  const labelCls = "block text-[11px] text-[#7D5B5980] font-[600] mb-1";

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 h-full overflow-y-auto">
        <div className="bg-white border rounded-lg shadow-sm flex flex-col h-full">
          {/* Toolbar row */}
         

          {/* Canvas area */}
          {previewMode === "phone" ? (
            <PhonePreviewWrapper>
              {canvas}
            </PhonePreviewWrapper>
          ) : (
            <div className="p-4 flex-1 min-h-0 flex flex-col">
              {canvas}
            </div>
          )}
        </div>
      </div>

      {/* Inspector — hidden in phone preview, replaced by compact position panel */}
      {previewMode === "phone" ? (
        <div className="w-72 bg-brand-cream border-[#EDE2DE] border rounded-lg overflow-y-auto h-full shrink-0">
          <div className="border-b border-[#EDE2DE] pb-3 p-4">
            <h3 className="font-semibold text-[16px] text-[#7D5B59]">
              {selected?.type ?? "Position"}
            </h3>
          </div>
          {!selected ? (
            <div className="p-4 text-sm text-neutral-500">Select an element to edit its position</div>
          ) : (
            <div className="p-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Top</label>
                  <input
                    className={inputCls}
                    type="number"
                    value={Math.round(selected.top ?? 0)}
                    onChange={(e) => updateSelected({ top: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Left</label>
                  <input
                    className={inputCls}
                    type="number"
                    value={Math.round(selected.left ?? 0)}
                    onChange={(e) => updateSelected({ left: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Width</label>
                  <input
                    className={inputCls}
                    type="number"
                    value={Math.round((selected.width ?? 0) * (selected.scaleX ?? 1))}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      const scaleX = w / (selected.width ?? w);
                      updateSelected({ scaleX });
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>Height</label>
                  <input
                    className={inputCls}
                    type="number"
                    value={Math.round((selected.height ?? 0) * (selected.scaleY ?? 1))}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      const scaleY = h / (selected.height ?? h);
                      updateSelected({ scaleY });
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold bg-[#F2E8E6B2] text-[#7D5B59]"
                  onClick={() => editorRef?.current?.bringForward()}
                >
                  Bring Forward
                </button>
                <button
                  className="flex-1 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold bg-[#F2E8E6B2] text-[#7D5B59]"
                  onClick={() => editorRef?.current?.sendBack()}
                >
                  Send Back
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Inspector selected={selected} updateSelected={updateSelected} editorRef={editorRef} />
      )}
    </div>
  );
}
