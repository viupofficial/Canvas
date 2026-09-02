'use client';

/**
 * PdfExportModal
 *
 * "Share PDF" used to download straight away, at whatever size jsPDF made of
 * the canvas — which came out noticeably larger than the artwork. This panel
 * puts a preview in front of that download: the sheet is drawn from the same
 * `computeLayout` the writer uses, so what is on screen is what lands in the
 * file, and the user can pick the paper, orientation, fit, margin, background,
 * quality and which pages go in before committing.
 */

import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import type { EditorHandle } from "@/src/components/CanvasEditor";
import {
  PAPER_LABELS,
  computeLayout,
  defaultPdfOptions,
  formatPaperSize,
  type PaperId,
  type PdfExportOptions,
  type PdfFit,
  type PdfOrientation,
} from "@/src/lib/pdfExport";

const PAPER_ORDER: PaperId[] = ["canvas", "a4", "a5", "a6", "letter", "square"];

const ORIENTATIONS: { id: PdfOrientation; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
];

const FITS: { id: PdfFit; label: string; hint: string }[] = [
  { id: "contain", label: "Fit", hint: "Whole page visible, blank bars if the sheet is a different shape." },
  { id: "cover", label: "Fill", hint: "Fills the sheet edge to edge; the overflow is cropped." },
  { id: "stretch", label: "Stretch", hint: "Fills the sheet by distorting the artwork." },
];

const QUALITIES: { id: 1 | 2 | 3; label: string; hint: string }[] = [
  { id: 1, label: "Standard", hint: "Screen size — smallest file." },
  { id: 2, label: "High", hint: "Crisp on screen and for home printing." },
  { id: 3, label: "Max", hint: "Sharpest for print — largest file." },
];

const BACKGROUNDS = ["#ffffff", "#F7F2F0", "#EDE2DE", "#191212"];

// The preview sheet is drawn inside this box (CSS px) whatever the paper is.
const PREVIEW_BOX_W = 300;
const PREVIEW_BOX_H = 420;

export default function PdfExportModal(props: {
  editorRef: RefObject<EditorHandle>;
  eventName: string;
  onClose: () => void;
}) {
  const { editorRef, eventName, onClose } = props;

  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [source, setSource] = useState({ width: 396, height: 704 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(0);
  const [fileName, setFileName] = useState(eventName.trim() || "wedding-invitation");
  const [opts, setOpts] = useState<PdfExportOptions>(() => defaultPdfOptions(0));

  const set = <K extends keyof PdfExportOptions>(key: K, value: PdfExportOptions[K]) =>
    setOpts((prev) => ({ ...prev, [key]: value }));

  // Render every page once at preview quality. The export re-renders at the
  // chosen quality — these thumbnails only have to be faithful, not print-sized.
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    (async () => {
      const editor = editorRef.current;
      if (!editor) return;
      try {
        const count = editor.getPageCount();
        const { images, width, height } = await editor.renderPages({ multiplier: 2 });
        if (cancelled.current) return;
        setPageCount(count);
        setThumbs(images);
        setSource({ width, height });
        setOpts(defaultPdfOptions(images.length));
      } catch (e) {
        if (!cancelled.current) setError((e as Error).message || "Could not render the pages.");
      } finally {
        if (!cancelled.current) setLoading(false);
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [editorRef]);

  // Escape closes, unless an export is already running.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !exporting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [exporting, onClose]);

  const selected = opts.pages;
  const layout = useMemo(
    () => computeLayout(opts, source.width, source.height),
    [opts, source.width, source.height]
  );

  // Keep the previewed page on one that is actually being exported.
  useEffect(() => {
    if (selected.length && !selected.includes(preview)) setPreview(selected[0]);
  }, [selected, preview]);

  const previewIndexInSelection = Math.max(0, selected.indexOf(preview));
  const step = (delta: number) => {
    if (!selected.length) return;
    const next = (previewIndexInSelection + delta + selected.length) % selected.length;
    setPreview(selected[next]);
  };

  const togglePage = (index: number) => {
    setOpts((prev) => {
      const has = prev.pages.includes(index);
      // Never let the last page be removed — an empty PDF is not a document.
      if (has && prev.pages.length === 1) return prev;
      const pages = has
        ? prev.pages.filter((i) => i !== index)
        : [...prev.pages, index].sort((a, b) => a - b);
      return { ...prev, pages };
    });
  };

  const handleDownload = async () => {
    const editor = editorRef.current;
    if (!editor || exporting || !selected.length) return;
    setExporting(true);
    setError("");
    try {
      await editor.exportPDF(fileName, opts);
      onClose();
    } catch (e) {
      console.error("[share] pdf failed", e);
      setError((e as Error).message || "Could not export the PDF.");
    } finally {
      setExporting(false);
    }
  };

  // Scale the mm sheet into the preview box, then place the artwork with the
  // very same rectangle the PDF writer will use.
  const scale = Math.min(PREVIEW_BOX_W / layout.pageW, PREVIEW_BOX_H / layout.pageH);
  const artStyle = {
    left: layout.x * scale,
    top: layout.y * scale,
    width: layout.w * scale,
    height: layout.h * scale,
  };
  // "Fill" crops: blow the image up past its window and pull it back by the
  // crop offset, which is exactly what cropImageDataUrl does for the PDF.
  const imgStyle = {
    width: (layout.w * scale * source.width) / layout.crop.w,
    height: (layout.h * scale * source.height) / layout.crop.h,
    left: -(layout.crop.x / layout.crop.w) * layout.w * scale,
    top: -(layout.crop.y / layout.crop.h) * layout.h * scale,
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="PDF export options"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[900px] max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#EDE2DE]">
          <h2 className="text-[16px] font-bold text-[#191212] font-[Montserrat]">Share PDF</h2>
          <button
            onClick={onClose}
            disabled={exporting}
            aria-label="Close PDF export"
            className="text-[#7D5B59] hover:text-[#191212] disabled:opacity-40 text-xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-5 p-5 overflow-y-auto">
          {/* ── Preview ─────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
            <div
              className="relative flex items-center justify-center bg-[#F7F2F0] rounded-xl w-full"
              style={{ minHeight: PREVIEW_BOX_H + 32, padding: 16 }}
            >
              {loading ? (
                <span className="flex items-center gap-2 text-sm text-[#7D5B59]">
                  <Loader2 className="w-4 h-4 animate-spin" /> Rendering pages…
                </span>
              ) : (
                <div
                  className="relative shadow-[0_4px_18px_rgba(0,0,0,0.18)] overflow-hidden"
                  style={{
                    width: layout.pageW * scale,
                    height: layout.pageH * scale,
                    background: opts.background,
                  }}
                >
                  {thumbs[preview] && (
                    <div className="absolute overflow-hidden" style={artStyle}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbs[preview]}
                        alt={`Page ${preview + 1} preview`}
                        className="absolute max-w-none"
                        style={imgStyle}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {selected.length > 1 && (
              <div className="flex items-center gap-3 text-[13px] text-[#7D5B59] font-semibold">
                <button
                  onClick={() => step(-1)}
                  aria-label="Previous page"
                  className="p-1 rounded-lg hover:bg-[#F7F2F0]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>
                  Page {previewIndexInSelection + 1} / {selected.length}
                </span>
                <button
                  onClick={() => step(1)}
                  aria-label="Next page"
                  className="p-1 rounded-lg hover:bg-[#F7F2F0]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <p className="text-[12px] text-[#7D5B59]/70">
              {formatPaperSize(layout.pageW, layout.pageH)} · {selected.length} page
              {selected.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* ── Controls ────────────────────────────────────────────── */}
          <div className="w-full md:w-[300px] shrink-0 flex flex-col gap-4">
            <Field label="Paper size">
              <select
                value={opts.paper}
                aria-label="Paper size"
                onChange={(e) => set("paper", e.target.value as PaperId)}
                className="w-full rounded-[10px] border border-[#EDE2DE] px-3 py-2 text-[13px] text-[#191212] bg-white"
              >
                {PAPER_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {PAPER_LABELS[id]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Orientation">
              <Segmented
                items={ORIENTATIONS.map((o) => ({ id: o.id, label: o.label }))}
                value={opts.orientation}
                onChange={(v) => set("orientation", v as PdfOrientation)}
              />
            </Field>

            <Field label="Scaling" hint={FITS.find((f) => f.id === opts.fit)?.hint}>
              <Segmented
                items={FITS.map((f) => ({ id: f.id, label: f.label }))}
                value={opts.fit}
                onChange={(v) => set("fit", v as PdfFit)}
              />
            </Field>

            <Field label={`Margin — ${opts.marginMm} mm`}>
              <input
                type="range"
                min={0}
                max={25}
                step={1}
                value={opts.marginMm}
                aria-label="Margin in millimetres"
                onChange={(e) => set("marginMm", Number(e.target.value))}
                className="w-full accent-[#7D5B59]"
              />
            </Field>

            <Field label="Page background">
              <div className="flex items-center gap-2">
                {BACKGROUNDS.map((color) => (
                  <button
                    key={color}
                    onClick={() => set("background", color)}
                    aria-label={`Background ${color}`}
                    className={`w-7 h-7 rounded-full border-2 ${
                      opts.background.toLowerCase() === color.toLowerCase()
                        ? "border-[#7D5B59]"
                        : "border-[#EDE2DE]"
                    }`}
                    style={{ background: color }}
                  />
                ))}
                <input
                  type="color"
                  value={opts.background}
                  onChange={(e) => set("background", e.target.value)}
                  aria-label="Custom background colour"
                  className="w-7 h-7 rounded-full border border-[#EDE2DE] bg-transparent p-0 cursor-pointer"
                />
              </div>
            </Field>

            <Field label="Quality" hint={QUALITIES.find((q) => q.id === opts.quality)?.hint}>
              <Segmented
                items={QUALITIES.map((q) => ({ id: String(q.id), label: q.label }))}
                value={String(opts.quality)}
                onChange={(v) => set("quality", Number(v) as 1 | 2 | 3)}
              />
            </Field>

            {pageCount > 1 && (
              <Field label="Pages to include">
                <div className="flex flex-wrap gap-2">
                  {thumbs.map((src, i) => {
                    const on = selected.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => togglePage(i)}
                        onDoubleClick={() => setPreview(i)}
                        aria-pressed={on}
                        title={`Page ${i + 1}`}
                        className={`relative w-[44px] h-[62px] rounded-[6px] overflow-hidden border-2 ${
                          on ? "border-[#7D5B59]" : "border-[#EDE2DE] opacity-40"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 right-0 bg-white/85 text-[9px] font-bold text-[#7D5B59] px-1 rounded-tl-[4px]">
                          {i + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}

            <Field label="File name">
              <div className="flex items-center rounded-[10px] border border-[#EDE2DE] px-3 py-2">
                <input
                  value={fileName}
                  aria-label="File name"
                  onChange={(e) => setFileName(e.target.value)}
                  className="flex-1 min-w-0 text-[13px] text-[#191212] outline-none bg-transparent"
                />
                <span className="text-[13px] text-[#7D5B59]/60">.pdf</span>
              </div>
            </Field>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-5 mb-2 rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[12px] font-semibold text-[#B23B3B]"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-[#EDE2DE]">
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 rounded-[100px] text-[14px] font-semibold text-[#7D5B59] hover:bg-[#F7F2F0] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={loading || exporting || !selected.length}
            className="bg-[#5a2d2d] text-white px-5 py-2 rounded-[100px] flex items-center gap-2 text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? "Exporting…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A plain group, not a <label>: a label wrapping several controls donates its
// text to the first labelable one inside it, which would rename the leading
// segmented button ("Fit") after the whole group. Each control carries its own
// aria-label instead.
function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={props.label} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-bold text-[#7D5B59] font-[Montserrat]">{props.label}</span>
      {props.children}
      {props.hint && <span className="text-[11px] text-[#7D5B59]/60 leading-snug">{props.hint}</span>}
    </div>
  );
}

function Segmented(props: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex rounded-[10px] border border-[#EDE2DE] overflow-hidden">
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => props.onChange(item.id)}
          className={`flex-1 px-2 py-2 text-[12px] font-semibold transition-colors ${
            props.value === item.id
              ? "bg-[#7D5B59] text-white"
              : "bg-white text-[#7D5B59] hover:bg-[#F7F2F0]"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
