"use client";
// updated
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Canvas as FabricCanvas } from "fabric";
import type { GradientDescriptor } from "@/src/lib/gradient";
import { Copy, Trash, Trash2, ClipboardPaste, ArrowUpToLine, ArrowDownToLine, Eye, EyeOff, X, Pencil, Crop, ImageUp, ArrowUp, ArrowDown, Type, Layers, ChevronDown, Group as GroupIcon, Ungroup as UngroupIcon, RotateCcw, Maximize, Minimize } from "lucide-react";
import EventFooter from "../components/EventFooter";
import MusicPlayer from "../components/MusicPlayer";
import '../app/globals.css'
import TemplateList from "@/src/components/template-list";
import { envelopePage } from "@/src/components/template-list/EnvelopeTemplate";
import { galleryPage } from "@/src/components/template-list/galleryTemplate";
// The gallery template ships with a few decorative starter photos
// (galleryImage1 / galleryImage2 / …). Those are free defaults and must NOT
// count against the package photo budget — otherwise a Standard user (limit 8)
// could only add 6 of their own before hitting the cap. Derive the starter count
// from the template itself so it stays correct if the template changes.
const GALLERY_STARTER_COUNT = Array.isArray((galleryPage as any)?.objects)
  ? (galleryPage as any).objects.filter(
      (o: any) => typeof o?.name === "string" && o.name.startsWith("galleryImage"),
    ).length
  : 0;
import { countdownPage } from "@/src/components/template-list/timeBoxTemplate";
import { guestbookPage } from "@/src/components/template-list/guestbookTemplate";
import { useEventDataOptional } from "@/src/store/EventDataContext";
import { useFabricEventSync } from "@/src/hooks/useFabricEventSync";
import { FONT_GROUPS, loadGoogleFont, collectFontFamilies, preloadFonts } from "@/src/lib/fonts";
import { downscaleImageFile } from "@/src/lib/imageDownscale";
// Cheap to import: the MP3 encoder itself sits behind a dynamic import *inside*
// optimizeAudioFile, so it only downloads when a music file is actually picked.
import { optimizeAudioFile, validateAudioFile, formatBytes } from "@/src/lib/audioOptimize";
import { saveLocalPreview } from "@/src/lib/localPreview";
import { extractEnvelope } from "@/src/lib/extract-envelope";
import { eventBlobPath, eventSlug } from "@/src/lib/slug";
import RsvpSkeleton from "@/src/components/RsvpSkeleton";
import { getPackageRules } from "@/src/lib/packageRules";
import { normalizePresentationMode, type PresentationMode } from "@/src/lib/presentationMode";
import { upload } from "@vercel/blob/client";
import { uploadEditedImage } from "@/src/lib/uploadEditedImage";
import { createGifOverlay, type GifOverlay } from "@/src/lib/gifOverlay";
import { showPackageToast } from "@/src/components/PackageLimitToast";
import {
  ENABLE_SMART_SNAPPING,
  ENABLE_RESIZE_SNAPPING,
  MIN_ELEMENT_WIDTH,
  MIN_ELEMENT_HEIGHT,
  getElementBox,
  getCanvasBox,
  getReferenceBoxes,
  computeMoveGuides,
  computeResizeGuides,
  distributeBoxesHorizontally,
  distributeBoxesVertically,
  drawSmartGuides,
  type SmartGuide,
  type SnapCandidate,
  type Box,
} from "@/src/lib/smartGuides";

// Which pages a background change touches: just the active page (default) or
// the whole invitation (PowerPoint's "Apply to All").
export type BackgroundScope = 'current' | 'all';

// Adjustment options for an uploaded background image — modeled on PowerPoint's
// "Format Background" panel (picture / texture fill). All fields are optional so
// callers can pass just what they need; sensible defaults fill the rest.
export type BackgroundOptions = {
  // How the (non-tiled) image is sized to the page.
  fit?: 'cover' | 'contain' | 'stretch';
  // When true the image repeats as a texture instead of being sized to the page.
  tile?: boolean;
  // User scale multipliers layered on top of the fit base (1 = 100%).
  scaleX?: number;
  scaleY?: number;
  // Pixel offset from centered (non-tile) / from origin (tile).
  offsetX?: number;
  offsetY?: number;
  // 0..1 — 1 is fully opaque (PowerPoint exposes the inverse as "Transparency").
  opacity?: number;
  // Mirror the image horizontally / vertically.
  flipX?: boolean;
  flipY?: boolean;
};

// What the Background panel reads back off the active page so it can mirror the
// page's current background (image + adjustments, a flat color, or nothing).
export type BackgroundReadback =
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  | { kind: 'image'; src: string; opts: BackgroundOptions };

export type EditorHandle = {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  save: () => void;
  exportPNG: () => void;
  exportHTML: (eventName?: string) => Promise<string>;
  exportPDF: (eventName?: string) => Promise<void>;
  previewLocal: (eventName?: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  toggleFullscreen: () => void;
  updateActiveObject: (props: Record<string, any>) => void;
  deleteActiveObject: () => void;
  bringForward: () => void;
  sendBack: () => void;
  getActiveObject: () => any | null;
  addShape: (shape: string) => void;
  // Insert a prebuilt interactive element onto the current page.
  addCountdown: () => void;
  addGuestbook: () => void;
  addText: (text?: string, opts?: Record<string, any>) => void;
  enterTextTool: () => void;
  exitTextTool: () => void;
  // Vector-style line tool: press on the canvas to anchor the first point, drag
  // to stretch the line, release to place it. Escape cancels.
  enterLineTool: () => void;
  exitLineTool: () => void;
  uploadImage: () => void;
  addImageFromUrl: (url: string) => void;
  addMusicFromUrl: (url: string) => void;
  uploadMusic: () => void;
  playMusic: () => void;
  pauseMusic: () => void;
  getMusicUrl: () => string | null;
  // True while a music file is still streaming to blob storage. Preview/Save
  // read this to avoid publishing before the upload finishes (which would drop
  // the track from the published page and the saved design).
  isMusicUploading: () => boolean;
  loadTemplate: (pages: any[]) => void;
  addGalleryPage: () => void;
  removeGalleryPage: () => void;
  hasGalleryPage: () => boolean;
  addPhotoToGallery: (url: string) => void;
  // Number of USER-added photos on the gallery page — the template's free starter
  // photos are excluded (0 if no gallery). Used to enforce the per-package gallery
  // limit before adding another photo.
  getGalleryCount: () => number;
  setGallerySlideInterval: (ms: number) => void;
  addBorder: (url: string) => void;
  setBackgroundColor: (color: string, scope?: BackgroundScope) => void;
  setBackgroundImage: (url: string | null, opts?: BackgroundOptions, scope?: BackgroundScope) => void;
  // Read the active page's current background so the panel can display it.
  getBackground: () => BackgroundReadback;
  previewAnimation: (type: string) => void;
  getActiveImageSrc: () => string | null;
  replaceActiveImage: (dataUrl: string) => void;
  isActiveObjectImage: () => boolean;
  getProjectData: () => {
    pages: any[];
    currentPage: number;
    musicUrl: string | null;
    presentationMode: PresentationMode;
  };
  // ── Artboard: Continuous Scroll ────────────────────────────────────────────
  // Presentation only. Changing this never touches the pages, the page order or
  // the editor canvas — it only decides how the preview / published invitation
  // plays back (see src/lib/presentationMode.ts).
  getPresentationMode: () => PresentationMode;
  setPresentationMode: (mode: PresentationMode) => void;
  getThumbnail: () => string;
  goToPage: (index: number) => void;
  reorderPages: (from: number, to: number) => void;
  // ── Page management ────────────────────────────────────────────────────────
  // Driven by the desktop page bar, the phone header's ⋮ menu and the phone
  // edge hold-and-swipe gesture. `removePage` asks for confirmation itself
  // unless the caller has already confirmed (skipConfirm).
  addPage: () => void;
  removePage: (opts?: { skipConfirm?: boolean }) => void;
  getPageCount: () => number;
  getCurrentPageIndex: () => number;
  // False for the envelope page and when only one page is left — both are
  // undeletable, so callers can grey the delete action out instead of failing.
  canDeleteCurrentPage: () => boolean;
  // ── Layer tab ──────────────────────────────────────────────────────────────
  // All scoped to the active page (the canvas only ever holds its objects).
  getLayers: () => LayerInfo[];
  selectLayer: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  moveLayerToFront: (id: string) => void;
  moveLayerToBack: (id: string) => void;
  moveLayerTo: (id: string, canvasIndex: number) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  deleteLayer: (id: string) => void;
  // ── Distribute (active multi-selection of ≥3 objects) ────────────────────────
  // Equalises the gaps between selected elements; first/last stay fixed. No-op
  // for fewer than 3 selected. Wire these to toolbar buttons if desired.
  distributeHorizontally: () => void;
  distributeVertically: () => void;
  // ── Spacing (active multi-selection of ≥2 objects) ───────────────────────────
  // Gaps between adjacent elements along their dominant layout axis. `mixed` is
  // true when the gaps differ; `value` is the shared gap (or the first one when
  // mixed). adjust shifts EVERY gap by a delta (relative); set standardises them.
  getSelectionSpacing: () => { axis: 'x' | 'y'; gaps: number[]; mixed: boolean; value: number } | null;
  adjustSelectionSpacing: (delta: number) => void;
  setSelectionSpacing: (value: number) => void;
  // Align the current selection to the active frame/artboard (object alignment,
  // not text paragraph align). Scene-coordinate based, so zoom-safe.
  alignSelected: (
    alignment: 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom'
  ) => void;
}
const MAX_HISTORY = 50;
const HISTORY_DEBOUNCE_MS = 120;
// Backstore dimensions of the canvas. The footer is designed against this width,
// so we scale it by the same factor the canvas is CSS-scaled to fit its wrap.
const CANVAS_REF_WIDTH = 396;
const CANVAS_REF_HEIGHT = 704;
// ── Editor zoom ────────────────────────────────────────────────────────────
// Zoom here means "look closer at the paper", not "move fabric's camera": it is
// a VISUAL scale of the whole artboard (canvas element + the floating footer),
// applied on top of the fit-to-workspace scale as CSS display size. Fabric's
// own setZoom() is deliberately never used for it — that scales objects inside
// a fixed-size canvas and would leak into snapshots/exports. The backstore
// stays CANVAS_REF_WIDTH × CANVAS_REF_HEIGHT and object data is untouched.
const EDITOR_ZOOM_MIN = 0.5;   //  50%
const EDITOR_ZOOM_MAX = 1.5;   // 150%
const EDITOR_ZOOM_STEP = 0.1;  //  10% per click / wheel notch
// 0.1 steps accumulate float dust (1.0999999…) — snap back onto the grid.
const clampEditorZoom = (v: number) =>
  Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, Math.round(v * 100) / 100));
type PageHistory = { undo: string[]; redo: string[] };
// Anything not inlined as a data URL — Blob-hosted GIFs and edited images —
// has to load with CORS, or the first canvas.toDataURL() (thumbnail, export)
// throws on a tainted canvas.
// downscaleImageFile rejects an over-sized GIF with a message meant for the
// user (every other failure falls back to the original image), so show it.
const reportImageFailure = (err: unknown) => {
  console.error('[CanvasEditor] image upload failed', err);
  showPackageToast(
    err instanceof Error && err.message ? err.message : "That image couldn't be added — please try again.",
    'error',
  );
};

const imageLoadOpts = (src: string) =>
  typeof src === "string" && src.startsWith("data:")
    ? undefined
    : { crossOrigin: "anonymous" as const };

const FABRIC_EXPORT_PROPS = [
  "action",
  "animationType",
  "animation",
  "musicUrl",
  "linkUrl",
  "url",
  "src",
  "_editedSrc",
  "targetPage",
  "pageIndex",
  "name",
  "id",
  "isBorder",
  "borderId",
  "locked",
  // Marks a "Counting Days" value box (day/hour/minute/second) so the ticker —
  // in both the editor and the published player — can find and update it.
  "countdownUnit",
  // Background-picture adjustment metadata, stashed on canvas.backgroundImage so
  // the Background panel can read back exactly what's applied to each page.
  "bgMeta",
] as const;

// Properties serialized for the lightweight `selected` snapshot handed to the Inspector.
const SELECTION_PROPS = [
  "type",
  "left",
  "top",
  "scaleX",
  "scaleY",
  "angle",
  "fill",
  "fontSize",
  "text",
  "width",
  "height",
  ...FABRIC_EXPORT_PROPS,
] as const;

// One layer row as consumed by the Inspector's Layer tab. Derived from a Fabric
// object on the *active page only* (the canvas never holds other pages' objects).
export type LayerInfo = {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  locked: boolean;
  isImage: boolean;
  isEnvelope?: boolean;
};

// A gradient arriving from the Inspector as plain JSON — either the compact
// descriptor it builds ({ type, angle, colorStops }) or a fabric-serialized
// gradient (has coords). Fabric only paints Gradient *instances* (it calls
// fill.toLive()), so these must be revived before being set on an object.
const isGradientDescriptor = (v: any): boolean =>
  !!v && typeof v === "object" && Array.isArray(v.colorStops);

const makeFabricGradient = (fabric: any, desc: any) => {
  const type = desc.type === "radial" ? "radial" : "linear";
  let coords = desc.coords;
  if (!coords) {
    if (type === "radial") {
      coords = { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 };
    } else {
      // Angle in degrees, 0 = left→right, measured clockwise. Coords are in
      // percentage units so the same gradient fits any object size.
      const rad = ((desc.angle ?? 0) * Math.PI) / 180;
      const dx = Math.cos(rad) / 2;
      const dy = Math.sin(rad) / 2;
      coords = { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
    }
  }
  return new fabric.Gradient({
    type,
    gradientUnits: desc.gradientUnits ?? "percentage",
    coords,
    colorStops: (desc.colorStops ?? []).map((s: any) => ({
      offset: s.offset ?? 0,
      color: s.color ?? "#000000",
    })),
    offsetX: desc.offsetX ?? 0,
    offsetY: desc.offsetY ?? 0,
  });
};

// Stable, collision-resistant id for Fabric objects that don't already have one.
// Persisted via FABRIC_EXPORT_PROPS ("id"), so it survives page save/reload.
let layerIdSeq = 0;
const genLayerId = () => `layer_${Date.now().toString(36)}_${(layerIdSeq++).toString(36)}`;

// Friendly fallback name from a Fabric object type.
const friendlyType = (type?: string): string => {
  switch ((type ?? "").toLowerCase()) {
    case "textbox":
    case "text":
    case "i-text":
      return "Text";
    case "image":
      return "Image";
    case "rect":
      return "Rectangle";
    case "circle":
      return "Circle";
    case "ellipse":
      return "Ellipse";
    case "triangle":
      return "Triangle";
    case "line":
      return "Line";
    case "polygon":
      return "Polygon";
    case "polyline":
      return "Polyline";
    case "path":
      return "Shape";
    case "group":
      return "Group";
    default:
      return "Layer";
  }
};

// Base (un-numbered) label for a layer: explicit name → text snippet → type.
const baseLayerLabel = (o: any): string => {
  if (o?.name && o.name !== "__border__") return String(o.name);
  const t = (o?.type ?? "").toLowerCase();
  if ((t === "textbox" || t === "text" || t === "i-text") && o?.text) {
    const s = String(o.text).replace(/\s+/g, " ").trim();
    if (s) return s.length > 18 ? s.slice(0, 18) + "…" : s;
  }
  return friendlyType(o?.type);
};


const CanvasEditor = forwardRef<
  EditorHandle, 
  {
    onSelectionChange?: (obj: any | null) => void;
    onEditImage?: (src: string, opts?: { crop?: boolean }) => void;
    onCanvasChange?: () => void;
    onLayersChange?: () => void;
    onPagesChange?: (count: number, current: number) => void;
    // Fired after the active page's content is (re)loaded — page switch, undo/redo,
    // template load. Lets panels re-read page-scoped state like the background.
    onContentReplaced?: () => void;
    // Fired when the music track actually changes (URL added or upload finished),
    // NOT on initial hydration. Lets the parent count real music changes for
    // package-limit tracking.
    onMusicChange?: (url: string) => void;
    initialPages?: any[] | null;
    initialMusicUrl?: string | null;
    contacts: any[];
    moneyGift: any;
    calendar: any;
    location: any;
    rsvpConfig?: {
      enabled?: boolean;
      maxGuest?: number;
      packTypeEnabled?: boolean;
      packTypeOption1?: string;
      packTypeOption2?: string;
      // Host-written wording for the RSVP card (blank/absent ⇒ default wording).
      title?: string;
      question?: string;
      paxNote?: string;
      // Solid CSS color or gradient descriptor (src/lib/gradient.ts).
      navColor: string | GradientDescriptor;
      navOpacity: number;
      textColor: string;
      textOpacity: number;
      circleColor?: string | GradientDescriptor;
      circleOpacity?: number;
    };
    userId?: string | number | null;
    eventId?: string | number | null;
    // Purchased package tier. Package 1 (Basic) hides RSVP + Money Gift in the
    // footer; null/undefined keeps both (backward compatible). Carried into the
    // export/preview payloads so the published card applies the same rule.
    packageId?: number | null;
    // How the invitation is PRESENTED to guests (preview / published page).
    // Purely a presentation setting — the editor canvas stays page-by-page.
    initialPresentationMode?: PresentationMode | string | null;
    onPresentationModeChange?: (mode: PresentationMode) => void;
  }
>((props, ref) => {
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [pages, setPages] = useState<any[]>(
    props.initialPages && props.initialPages.length ? props.initialPages : [envelopePage]
  );
const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const fabricModuleRef = useRef<any>(null);
  // Plays animated GIFs in a DOM layer over the canvas — Fabric can't, because
  // drawImage only ever sees a GIF's first frame. See src/lib/gifOverlay.ts.
  const gifOverlayRef = useRef<GifOverlay | null>(null);
  /** Capture helper: run `fn` with animated GIFs painted by Fabric again. */
  const withGifsOnCanvas = <T,>(fn: () => T): T =>
    gifOverlayRef.current ? gifOverlayRef.current.withFabricPainting(fn) : fn();
  // Flat color drawn behind the background picture (and used when a picture is
  // removed). Tracks the last solid color the user picked.
  const bgFlatColorRef = useRef<string>('#ffffff');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  // isLoaded flips when fabric is constructed and listeners are wired, which
  // happens BEFORE page 0's objects are enlivened (that runs in a setTimeout
  // below). Waiting on it alone would uncover a blank white artboard, so the
  // skeleton also waits for the first page to actually be on the canvas.
  const [firstPagePainted, setFirstPagePainted] = useState(false);
  // Kept mounted for one transition after the canvas is ready so the skeleton
  // dissolves into the real artboard instead of popping out.
  const [skeletonMounted, setSkeletonMounted] = useState(true);
  const canvasReady = isLoaded && firstPagePainted;
  useEffect(() => {
    if (!canvasReady) return;
    const t = setTimeout(() => setSkeletonMounted(false), 320);
    return () => clearTimeout(t);
  }, [canvasReady]);
  const [musicUrl, setMusicUrl] = useState<string | null>(props.initialMusicUrl ?? null);
  // Artboard → Continuous Scroll. Existing designs have nothing saved, so this
  // normalizes to "page" and they keep behaving exactly as before.
  const [presentationMode, setPresentationModeState] = useState<PresentationMode>(
    normalizePresentationMode(props.initialPresentationMode)
  );
  // Mirror for the imperative handle / payload builders, which are memoized and
  // must read the live value rather than the one captured at definition time.
  const presentationModeRef = useRef<PresentationMode>(presentationMode);
  useEffect(() => { presentationModeRef.current = presentationMode; }, [presentationMode]);
  // Publish the saved value once on mount so the Artboard toggle renders in the
  // right state when an existing design is reopened.
  const onPresentationModeChangeProp = props.onPresentationModeChange;
  useEffect(() => {
    onPresentationModeChangeProp?.(presentationModeRef.current);
    // Mount only — later changes are reported by setPresentationMode itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // True while a music file is streaming to blob storage. A ref (not state) so
  // Preview/Save can read the live value synchronously at click time.
  const musicUploadingRef = useRef(false);
  // Drives the in-editor preview player (and the sidebar play/pause button).
  const [musicPlaying, setMusicPlaying] = useState(true);
  // Per-page history. Map<pageIndex, {undo, redo}>. Top of `undo` is always the CURRENT state.
  const historiesRef = useRef<Map<number, PageHistory>>(new Map());
  // True while we're programmatically loading canvas content — blocks event-driven snapshots.
  const isRestoringRef = useRef(false);
  // Pending debounce timer for coalesced snapshots during rapid edits (drag, resize, etc.).
  const pendingPushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The date the countdown is ticking towards. Refreshed from the saved
  // calendar date each time the countdown is (re)started.
  const countdownTargetRef = useRef<Date | null>(null);
  const globalBordersRef = useRef<{ url: string; id: string }[]>([]);
  const [overlay, setOverlay] = useState<{ left: number; top: number; width: number; height: number; isImage: boolean; isText: boolean; fontFamily: string } | null>(null);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  // Selection-toolbar "Arrange" dropdown (stacking order).
  const [arrangeMenuOpen, setArrangeMenuOpen] = useState(false);
  // Rendered canvas box relative to its wrap (position, display size, fit-scale).
  // Used to anchor the floating event footer to the scaled canvas.
  const [canvasBox, setCanvasBox] = useState<{ left: number; top: number; width: number; height: number; scale: number } | null>(null);
  // The floating EventFooter overlaps the bottom of the artboard. We measure it
  // at align time (see alignSelectedToFrame) so object alignment can reserve that
  // band and keep elements above the footer visible.
  const footerScaleDivRef = useRef<HTMLDivElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  // The scrolling zoom viewport (the green workspace). It never resizes with its
  // content — the fit scale is measured from its non-scrolling parent — so
  // scrollbars appearing at zoom > 1 can't feed back into the fit calculation.
  const zoomViewportRef = useRef<HTMLDivElement | null>(null);
  // Non-scrolling frame around that viewport; the size we fit the artboard into.
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  // Set by the init effect: re-lays out the artboard at (fit × zoom).
  const fitCanvasRef = useRef<() => void>(() => {});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hidden: boolean; isImage: boolean; canGroup: boolean; isGroup: boolean } | null>(null);
  const clipboardRef = useRef<any>(null);
  // The image object currently being edited/replaced. Held in a ref so the edit
  // survives selection changes while the editor modal is open.
  const editingImageRef = useRef<any>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  // Keep the latest onEditImage callback reachable from stable ([]) handlers.
  const onEditImageRef = useRef(props.onEditImage);
  onEditImageRef.current = props.onEditImage;
  // Same pattern for the autosave change notifier.
  const onCanvasChangeRef = useRef(props.onCanvasChange);
  onCanvasChangeRef.current = props.onCanvasChange;
  // Fires whenever the active page's object list, order, visibility/lock, or
  // selection changes — so the Inspector's Layer tab can refresh.
  const onLayersChangeRef = useRef(props.onLayersChange);
  onLayersChangeRef.current = props.onLayersChange;
  const onPagesChangeRef = useRef(props.onPagesChange);
  onPagesChangeRef.current = props.onPagesChange;
  const onContentReplacedRef = useRef(props.onContentReplaced);
  onContentReplacedRef.current = props.onContentReplaced;
  // Everything the phone swipe-to-change-page gesture needs. The fabric
  // listeners are registered once during init, so they read the live values
  // through this ref instead of closing over that first render's copies. It is
  // filled in further down, right after goToPage/showPageToast exist.
  const pageNavRef = useRef<{
    goToPage: (index: number) => void;
    count: number;
    current: number;
    toast: (message: string) => void;
  }>({ goToPage: () => {}, count: 1, current: 0, toast: () => {} });
  // Start of an in-flight canvas swipe (null when the press isn't a candidate).
  const canvasSwipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  // What was selected immediately BEFORE the current press. Fabric selects
  // whatever a press lands on before it fires mouse:down, so by then
  // getActiveObject() already returns the just-touched element — this is the
  // only way to tell "the user is dragging their selection" from "the user
  // swiped across something".
  const prePressActiveRef = useRef<any>(null);
  // The background most recently pushed via "Apply to all pages". New pages
  // inherit it so an all-pages background also covers pages created later.
  const globalBgRef = useRef<{ backgroundImage?: any; backgroundColor?: any } | null>(null);
  const toggleFullscreenRef = useRef<() => void>(() => {});
  // Same pattern as toggleFullscreen: the keyboard/wheel handlers are registered
  // once during init, so they reach the live zoom setter through a ref.
  const applyZoomRef = useRef<(next: number) => void>(() => {});
  const textToolRef = useRef(false);
  const textToolStartRef = useRef<{ x: number; y: number } | null>(null);
  const textToolDraggedRef = useRef(false);
  // Line tool (vector-style): press to anchor the first point, drag to stretch
  // the line, release to place it. `lineDraftRef` holds the live fabric.Line
  // being stretched during the drag.
  const lineToolRef = useRef(false);
  const lineToolStartRef = useRef<{ x: number; y: number } | null>(null);
  const lineDraftRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasHydratedRef = useRef(false);
  // In-flight animation preview on the editor canvas. previewRestoreRef snaps the
  // previewed object back to its captured base values when the preview ends/cancels.
  const previewRafRef = useRef<number | null>(null);
  const previewRestoreRef = useRef<(() => void) | null>(null);
  // Smart guides (alignment / canvas-distance / gap / equal-spacing) computed
  // live during a drag/resize. Held in a ref (not state) so interacting never
  // triggers React re-renders; the lines are painted directly onto the Fabric
  // canvas in `after:render`.
  const smartGuidesRef = useRef<SmartGuide[]>([]);
  // Per-drag cache of the OTHER reference boxes, keyed by the object being moved,
  // so we don't re-scan the page on every mouse-move (smooth with many objects).
  const refBoxesCacheRef = useRef<{ owner: any; boxes: Box[] } | null>(null);
  // Previously chosen snap per axis — drives hysteresis so snaps don't flicker.
  const prevSnapXRef = useRef<SnapCandidate | undefined>(undefined);
  const prevSnapYRef = useRef<SnapCandidate | undefined>(undefined);

  // Live-preview sync: when eventData changes, find any Fabric objects that
  // opted in via `eventBinding` and update them in place (no full reload).
  // Uses the debounced value so rapid input typing doesn't thrash Fabric.
  const eventCtx = useEventDataOptional();
  useFabricEventSync(
    fabricRef.current,
    eventCtx?.debouncedEventData ?? {
      contacts: [],
      location: null,
      calendar: null,
      moneyGift: null,
      rsvpConfig: null,
    },
    !!eventCtx && isLoaded,
  );

  // Date the "Counting Days" countdown ticks towards. Prefer the live value
  // edited in the Calendar sidebar (debounced); fall back to the date saved on
  // the project. Saving a new date in the sidebar updates this and restarts
  // the countdown via the effect below.
  const calendarDate: string | null =
    eventCtx?.debouncedEventData?.calendar?.date ??
    (props.calendar?.date as string | undefined) ??
    null;

  // Mirror of calendarDate for non-reactive readers (startCountdown closures
  // captured by memoized callbacks) so they always tick towards the latest date.
  const calendarDateRef = useRef<string | null>(calendarDate);
  useEffect(() => { calendarDateRef.current = calendarDate; }, [calendarDate]);

  const updateOverlayFromActive = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) {
      setOverlay(null);
      return;
    }
    const active = canvas.getActiveObject();
    if (!active) {
      setOverlay(null);
      return;
    }

    try {
      const rect = active.getBoundingRect();
      const type = (active as any).type;
      const isText = type === 'textbox' || type === 'text' || type === 'i-text';
      setOverlay({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        isImage: type === 'image',
        isText,
        fontFamily: (active as any).fontFamily ?? 'Arial',
      });
    } catch (e) {
      setOverlay(null);
    }
  }, []);

  const serializeCanvas = useCallback((canvas: FabricCanvas) => {
    // Borders are persisted with the page they were placed on (no cross-page propagation).
    // NOTE: in Fabric v7 `Canvas.toJSON()` ignores any argument and serializes with NO
    // custom props — so we must use `toObject([...props])` (as the object-level calls do)
    // for FABRIC_EXPORT_PROPS like `name`, `linkUrl`, `locked` to actually round-trip.
    return (canvas as any).toObject([...FABRIC_EXPORT_PROPS]);
  }, []);

  // ---------- History core ----------
  // Lazily create history for a page so per-page undo/redo is fully independent.
  const getPageHistory = useCallback((index: number): PageHistory => {
    let h = historiesRef.current.get(index);
    if (!h) { h = { undo: [], redo: [] }; historiesRef.current.set(index, h); }
    return h;
  }, []);

  // Push current canvas state to the active page's history. Dedupes consecutive duplicates.
  const commitSnapshot = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    let snap: string;
    try { snap = JSON.stringify(serializeCanvas(canvas)); }
    catch (e) { console.error("Failed to serialize canvas", e); return; }
    const h = getPageHistory(currentPageRef.current);
    if (h.undo[h.undo.length - 1] === snap) return;
    h.undo.push(snap);
    if (h.undo.length > MAX_HISTORY) h.undo.shift();
    h.redo.length = 0; // any new action invalidates the redo branch
  }, [serializeCanvas, getPageHistory]);

  // Cancels pending debounced push and commits immediately (used before undo/page switch).
  const flushPending = useCallback(() => {
    if (pendingPushRef.current != null) {
      clearTimeout(pendingPushRef.current);
      pendingPushRef.current = null;
      commitSnapshot();
    }
  }, [commitSnapshot]);

  // Debounced push — collapses bursts of events (drag, resize) into a single history entry.
  const schedulePush = useCallback(() => {
    if (isRestoringRef.current) return;
    if (pendingPushRef.current != null) clearTimeout(pendingPushRef.current);
    pendingPushRef.current = setTimeout(() => {
      pendingPushRef.current = null;
      commitSnapshot();
    }, HISTORY_DEBOUNCE_MS);
  }, [commitSnapshot]);

  // Single safe entry point for programmatic canvas replacement. Guards history tracking
  // so object:added/removed events fired by loadFromJSON do not pollute the undo stack.
  const replaceCanvasContent = useCallback((json: any, onDone?: () => void) => {
    const canvas = fabricRef.current;
    if (!canvas) { onDone?.(); return; }
    isRestoringRef.current = true;

    const finish = () => {
      canvas.renderAll();
      isRestoringRef.current = false;

      // Lock envelope objects so they cannot be moved, scaled, or rotated (but can be styled)
      if (isCurrentPageEnvelope()) {
        canvas.forEachObject((obj: any) => {
          if (isEnvelopeObj(obj)) {
            // Allow selection for styling (color, texture, etc) but prevent geometry changes
            obj.lockMovementX = true;
            obj.lockMovementY = true;
            obj.lockScalingX = true;
            obj.lockScalingY = true;
            obj.lockRotation = true;
            obj.hasControls = false;
          }
        });
      }

      // The active page's object list just changed (page switch, undo/redo,
      // template load) — refresh the Layer tab.
      onLayersChangeRef.current?.();
      // …and re-scan for animated GIFs, which are played by a DOM layer rather
      // than by Fabric and so aren't carried along by loadFromJSON.
      gifOverlayRef.current?.refresh();
      // Same triggers let page-scoped panels (e.g. Background) re-read state.
      onContentReplacedRef.current?.();
      onDone?.();
      // Webfonts referenced by the loaded design may not be ready yet; once they
      // are, repaint so text is measured/rendered against the real face.
      const families = collectFontFamilies(json);
      if (families.length) {
        preloadFonts(families).then(() => {
          fabricRef.current?.requestRenderAll();
        });
      }
    };

    try {
      if (json == null) {
        canvas.clear();
        finish();
        return;
      }

      // Fabric v7: loadFromJSON returns a Promise (second arg is now a reviver, not a callback).
      // Fabric v5: loadFromJSON is callback-based and returns the canvas synchronously.
      const result = canvas.loadFromJSON(json);
      if (result && typeof (result as any).then === 'function') {
        (result as any).then(finish).catch((e: any) => {
          console.error("replaceCanvasContent failed", e);
          isRestoringRef.current = false;
          onDone?.();
        });
      } else {
        // v5 fallback: not a Promise, so reload with callback style
        canvas.loadFromJSON(json, finish);
      }
    } catch (e) {
      console.error("replaceCanvasContent failed", e);
      isRestoringRef.current = false;
      onDone?.();
    }
  }, []);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Force the canvas to re-render whenever the active page changes.
  // This ensures content isn't invisible after React commits state updates.
  useEffect(() => {
    if (!isLoaded || !fabricRef.current) return;
    fabricRef.current.requestRenderAll();
  }, [currentPage, isLoaded]);

  // helper to create and add predefined shapes
  const addShape = useCallback((shape: string) => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;

    let obj: any = null;
    const s = String(shape).toLowerCase();

    try {
      switch (s) {
        case 'circle':
          obj = new fabric.Circle({ radius: 40, left: 100, top: 100, fill: '#F3F4F6' });
          break;
        case 'ellipse':
          obj = new fabric.Ellipse({ rx: 50, ry: 30, left: 100, top: 100, fill: '#F3F4F6' });
          break;
        case 'line':
          obj = new fabric.Line([50, 50, 150, 150], { stroke: '#111827', strokeWidth: 3, left: 80, top: 80 });
          break;
        case 'polygon':
          obj = new fabric.Polygon([
            { x: 0, y: 50 },
            { x: 50, y: 0 },
            { x: 100, y: 50 },
            { x: 50, y: 100 },
          ], { left: 80, top: 80, fill: '#E6E6FA' });
          break;
        case 'polyline':
          obj = new fabric.Polyline([
            { x: 0, y: 40 },
            { x: 30, y: 0 },
            { x: 60, y: 40 },
            { x: 90, y: 0 },
          ], { left: 80, top: 80, stroke: '#111827', strokeWidth: 3, fill: '' });
          break;
        case 'rect':
          obj = new fabric.Rect({ width: 120, height: 80, left: 80, top: 80, fill: '#F9FAFB' });
          break;
        case 'triangle':
          obj = new fabric.Triangle({ width: 100, height: 80, left: 80, top: 80, fill: '#F3F4F6' });
          break;
        default:
          console.warn('Unknown shape:', shape);
      }
    } catch (e) {
      console.error('Failed to create shape', shape, e);
    }

    if (obj) {
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      pushSnapshot();
    }
  }, []);

  // Drop a prebuilt interactive element (the "Counting Days" countdown or the
  // "Guestbook") onto the current page. The element is the same object set used
  // by the full-page templates, so it carries the markers (`countdownUnit`,
  // `name`) the editor and the published player rely on to drive its behaviour.
  // Objects are added loose (not grouped) so the countdown ticker can find and
  // rewrite each value box in place. An optional drop point shifts the whole set.
  const addElement = useCallback((kind: 'countdown' | 'guestbook', pos?: { x: number; y: number }) => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;

    const source = kind === 'countdown' ? countdownPage.objects : guestbookPage.objects;
    // Deep-clone the template defs so we never mutate the shared module export.
    const defs = source.map((o) => ({ ...o }));

    // Enliven each def on its own so a single object that fails to revive (e.g. an
    // image whose src 404s) is skipped instead of rejecting the whole batch and
    // silently dropping the entire element. The functional textboxes — which carry
    // the markers the player relies on (countdownUnit, guestMessage/guestSender) —
    // must always reach the canvas even if a decorative asset is missing.
    const enlivenOne = (def: any) =>
      fabric.util
        .enlivenObjects([def])
        .then((arr: any[]) => arr[0] ?? null)
        .catch((e: any) => {
          console.error('Failed to revive element object', kind, def?.type, def?.src, e);
          return null;
        });

    Promise.all(defs.map(enlivenOne)).then((revived: any[]) => {
      const objs = revived.filter(Boolean);
      if (!objs.length) return;
      // Shift the element so its top-left lands near the drop point (drag) while
      // keeping the boxes' relative layout intact.
      let dx = 0, dy = 0;
      if (pos) {
        const minLeft = Math.min(...objs.map((o) => o.left ?? 0));
        const minTop = Math.min(...objs.map((o) => o.top ?? 0));
        dx = pos.x - minLeft;
        dy = pos.y - minTop;
      }
      objs.forEach((o) => {
        o.set?.({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy, selectable: true, evented: true });
        o.setCoords?.();
        canvas.add(o);
      });
      canvas.requestRenderAll();
      // The countdown boxes only start ticking once they're on the canvas.
      if (kind === 'countdown') startCountdown(canvas);
      pushSnapshot();
    }).catch((e: any) => console.error('Failed to add element', kind, e));
  }, []);

  // Distribute the active multi-selection so gaps are equal (Figma "distribute").
  // Works in scene coordinates: we discard the ActiveSelection first so each
  // child reports absolute coords, reposition the middle items, then re-select.
  function distributeSelection(axis: 'x' | 'y') {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;
    const active = canvas.getActiveObject() as any;
    if (!active || active.type !== 'activeselection') return;
    const objs: any[] = [...(active.getObjects?.() ?? [])];
    if (objs.length < 3) return;

    canvas.discardActiveObject();
    objs.forEach((o) => o.setCoords?.());
    const items = objs
      .map((o) => ({ obj: o, box: getElementBox(o) }))
      .filter((i): i is { obj: any; box: Box } => !!i.box && !!i.box.id);

    if (axis === 'x') {
      const result = distributeBoxesHorizontally(items.map((i) => i.box));
      const byId = new Map(result.map((r) => [r.id, r.left]));
      for (const { obj, box } of items) {
        const left = byId.get(box.id!);
        if (left != null) { obj.set('left', (obj.left ?? 0) + (left - box.left)); obj.setCoords?.(); }
      }
    } else {
      const result = distributeBoxesVertically(items.map((i) => i.box));
      const byId = new Map(result.map((r) => [r.id, r.top]));
      for (const { obj, box } of items) {
        const top = byId.get(box.id!);
        if (top != null) { obj.set('top', (obj.top ?? 0) + (top - box.top)); obj.setCoords?.(); }
      }
    }

    // Re-select the same objects so the user keeps their multi-selection.
    const sel = new fabric.ActiveSelection(objs, { canvas });
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
  }

  // Align the current selection to the active frame/artboard (Figma-style object
  // alignment — distinct from text paragraph align). The frame is the canvas
  // backstore (top-left 0,0 → canvas.width × canvas.height) in SCENE coordinates,
  // so this is independent of zoom / CSS scaling. getBoundingRect() gives the
  // selection's axis-aligned box in the same scene space (accounts for rotation,
  // scale, and origin), and we only translate left/top — never resize.
  //
  // Single object / group → translate that object. Multi-selection → translate
  // every child by the same delta (preserving their relative spacing), following
  // the same discard→move→re-select pattern as distributeSelection so positions
  // serialize correctly. Locked elements are skipped; nothing selected = no-op.
  function alignSelectedToFrame(
    alignment: 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom'
  ) {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;
    const active = canvas.getActiveObject() as any;
    if (!active) return;

    const frameW = (canvas.width as number) || CANVAS_REF_WIDTH;
    const frameH = (canvas.height as number) || CANVAS_REF_HEIGHT;
    // The EventFooter covers the bottom band of the artboard, so vertical
    // alignment targets only the area ABOVE it (matches what stays visible in
    // the published invite). Horizontal alignment uses the full width.
    //
    // Measure the footer's reserved height in SCENE units at click time: take the
    // ratio of the footer's rendered height to the canvas's rendered height and
    // scale it back into the frame's coordinate space. Using a ratio makes this
    // robust to zoom, CSS scaling, and retina — no screen-pixel assumptions.
    let footerH = 0;
    const footerEl = footerScaleDivRef.current;
    const cEl = canvasEl.current;
    if (footerEl && cEl) {
      const fr = footerEl.getBoundingClientRect();
      const cr = cEl.getBoundingClientRect();
      if (cr.height > 0 && fr.height > 0) footerH = (fr.height / cr.height) * frameH;
    }
    const usableH = Math.max(1, frameH - footerH);

    // Scene-space bounding box of the whole selection (single, group, or multi).
    const r = active.getBoundingRect();
    let dx = 0, dy = 0;
    switch (alignment) {
      case 'left':              dx = 0 - r.left; break;
      case 'horizontal-center': dx = (frameW - r.width) / 2 - r.left; break;
      case 'right':             dx = (frameW - r.width) - r.left; break;
      case 'top':               dy = 0 - r.top; break;
      case 'vertical-center':   dy = (usableH - r.height) / 2 - r.top; break;
      case 'bottom':            dy = (usableH - r.height) - r.top; break;
    }
    if (dx === 0 && dy === 0) return;

    if (active.type === 'activeselection') {
      // Move each child by the shared delta so spacing between them is preserved.
      const objs: any[] = [...(active.getObjects?.() ?? [])];
      canvas.discardActiveObject();
      objs.forEach((o) => {
        if (o.locked || o.isBorder) return;
        o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
        o.setCoords?.();
      });
      const sel = new fabric.ActiveSelection(objs, { canvas });
      canvas.setActiveObject(sel);
    } else {
      if (active.locked || active.isBorder) return; // never move a locked element
      active.set({ left: (active.left ?? 0) + dx, top: (active.top ?? 0) + dy });
      active.setCoords?.();
    }

    canvas.requestRenderAll();
    pushSnapshot();                       // undo/redo
    saveCurrentPage(currentPageRef.current); // persist x/y into the page JSON
    updateOverlayFromActive();
    const a = canvas.getActiveObject();
    if (typeof props.onSelectionChange === 'function') {
      props.onSelectionChange(a ? a.toObject([...SELECTION_PROPS]) : null);
    }
  }

  // ── Selection spacing (Figma-style "space between") ──────────────────────────
  // Boxes/axis/gaps for a set of selection children. getBoundingRect() is scene-
  // space in Fabric v7 even while the objects sit inside the ActiveSelection, so
  // this works for both reading (selection intact) and writing (after discard).
  // The dominant axis is the one the element centers spread most along; gaps are
  // measured between adjacent bounding boxes in that order (negative = overlap).
  function computeSpacingLayout(objs: any[]) {
    const items = objs.map((o) => {
      const r = o.getBoundingRect();
      return { obj: o, left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const cxs = items.map((i) => i.left + i.width / 2);
    const cys = items.map((i) => i.top + i.height / 2);
    const axis: 'x' | 'y' =
      Math.max(...cxs) - Math.min(...cxs) >= Math.max(...cys) - Math.min(...cys) ? 'x' : 'y';
    items.sort((a, b) => (axis === 'x' ? a.left - b.left : a.top - b.top));
    const gaps: number[] = [];
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      gaps.push(
        axis === 'x'
          ? items[i].left - (prev.left + prev.width)
          : items[i].top - (prev.top + prev.height)
      );
    }
    return { items, axis, gaps };
  }

  function getSelectionSpacing() {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    const active = canvas.getActiveObject() as any;
    if (!active || active.type !== 'activeselection') return null;
    const objs: any[] = [...(active.getObjects?.() ?? [])];
    if (objs.length < 2) return null;
    const { axis, gaps } = computeSpacingLayout(objs);
    const rounded = gaps.map((g) => Math.round(g));
    const mixed = rounded.some((g) => g !== rounded[0]);
    return { axis, gaps: rounded, mixed, value: rounded[0] };
  }

  // Rewrite the gaps of the active multi-selection: the first element (in axis
  // order) stays fixed and each following element is shifted so gap i becomes
  // makeGaps(gaps)[i]. Same discard→move→re-select pattern as distribute/align
  // so the new positions serialize correctly.
  function applySelectionSpacing(makeGaps: (gaps: number[]) => number[]) {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;
    const active = canvas.getActiveObject() as any;
    if (!active || active.type !== 'activeselection') return;
    const objs: any[] = [...(active.getObjects?.() ?? [])];
    if (objs.length < 2) return;

    canvas.discardActiveObject();
    objs.forEach((o) => o.setCoords?.());
    const { items, axis, gaps } = computeSpacingLayout(objs);
    const newGaps = makeGaps(gaps);

    let cursor = axis === 'x' ? items[0].left + items[0].width : items[0].top + items[0].height;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      const start = axis === 'x' ? it.left : it.top;
      const target = cursor + newGaps[i - 1];
      const d = target - start;
      if (d) {
        if (axis === 'x') it.obj.set('left', (it.obj.left ?? 0) + d);
        else it.obj.set('top', (it.obj.top ?? 0) + d);
        it.obj.setCoords?.();
      }
      cursor = target + (axis === 'x' ? it.width : it.height);
    }

    const sel = new fabric.ActiveSelection(objs, { canvas });
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
    // Scrubbing calls this per pixel of drag, so keep the per-call work at the
    // level of a normal object drag: debounced history push + selection refresh.
    // No saveCurrentPage here — like updateActiveObject, the page JSON is
    // re-serialized from the live canvas on save/page-switch/export.
    pushSnapshot();
    updateOverlayFromActive();
    if (typeof props.onSelectionChange === 'function') {
      props.onSelectionChange(sel.toObject([...SELECTION_PROPS]));
    }
  }

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    canUndo,
    canRedo,
    distributeHorizontally: () => distributeSelection('x'),
    distributeVertically: () => distributeSelection('y'),
    getSelectionSpacing,
    adjustSelectionSpacing: (delta) => applySelectionSpacing((gaps) => gaps.map((g) => g + delta)),
    setSelectionSpacing: (value) => applySelectionSpacing((gaps) => gaps.map(() => value)),
    alignSelected: (alignment) => alignSelectedToFrame(alignment),
    save: saveLocal,
    
    exportPNG,
    exportHTML,
    exportPDF,
    previewLocal: (eventName?: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const currentPageJson = serializeCanvas(canvas);
      const exportedPages = pages.map((page, index) =>
        index === currentPage ? currentPageJson : (page ?? null)
      );
      const payload = {
        pages: exportedPages,
        musicUrl,
        eventName: eventName ?? "",
        contacts: props.contacts,
        moneyGift: props.moneyGift,
        calendar: props.calendar,
        location: props.location,
        // Same store-first read as exportHTML — /preview-local must show the RSVP
        // settings currently being edited, not the defaults.
        rsvpConfig: eventCtx?.eventData.rsvpConfig ?? props.rsvpConfig ?? null,
        borders: globalBordersRef.current,
        userId: props.userId ?? null,
        eventId: props.eventId ?? null,
        packageId: props.packageId ?? null,
        presentationMode: presentationModeRef.current,
      };
      // Open the tab synchronously so the browser keeps it tied to the user's
      // click (avoids popup blocking); the preview page waits for IndexedDB.
      const win = window.open("/preview-local", "_blank");
      saveLocalPreview(payload).catch((e) => {
        console.error("[previewLocal] failed", e);
        win?.close();
        alert("Local preview failed: " + (e as Error).message);
      });
    },
    zoomIn,
    zoomOut,
    resetZoom,
    toggleFullscreen,
    loadTemplate, // ✅ ADD THIS
    addGalleryPage,
    removeGalleryPage,
    hasGalleryPage,
    addPhotoToGallery,
    getGalleryCount,
    setGallerySlideInterval,
    updateActiveObject: (props: Record<string, any>) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject() as any;
      if (!active) return;

      // Revive plain gradient descriptors (from the Inspector's gradient picker
      // or a raw fill↔stroke swap) into live fabric Gradient instances.
      const fabric = fabricModuleRef.current;
      if (fabric?.Gradient) {
        for (const key of ["fill", "stroke"]) {
          if (isGradientDescriptor(props[key])) {
            props = { ...props, [key]: makeFabricGradient(fabric, props[key]) };
          }
        }
      }

      // Geometry lives on the selection group; everything else (typography,
      // colors, …) should fan out to each child so a multi-selection can be
      // restyled in bulk — e.g. changing the font for several text boxes at once.
      const GEOMETRIC_PROPS = new Set([
        'left', 'top', 'scaleX', 'scaleY', 'angle', 'width', 'height', 'skewX', 'skewY',
      ]);
      const isMulti = active.type === 'activeselection';

      let groupProps = props;
      let targets: any[] = [];
      if (isMulti) {
        const childProps: Record<string, any> = {};
        const geomProps: Record<string, any> = {};
        for (const [k, v] of Object.entries(props)) {
          if (GEOMETRIC_PROPS.has(k)) geomProps[k] = v;
          else childProps[k] = v;
        }
        groupProps = geomProps;
        if (Object.keys(childProps).length) {
          targets = active.getObjects?.() ?? [];
          targets.forEach((o: any) => {
            o.set(childProps);
            if (childProps.fontFamily) o.dirty = true;
            o.setCoords?.();
          });
        }
      }

      if (Object.keys(groupProps).length) active.set(groupProps);
      // Fabric caches rendered text on an offscreen canvas; a plain set()+render
      // redraws from that stale cache, so a font change wouldn't show until the
      // object was otherwise invalidated (typing/resizing). Flag it dirty to
      // force an immediate re-render with the new glyphs.
      if (props.fontFamily && !isMulti) active.dirty = true;
      canvas.requestRenderAll();
      // A font-family change needs the webfont loaded, then a re-measure so the
      // text box reflows against the real glyphs (Inspector path). Reflow every
      // affected object — the single selection or each child of a multi-select.
      if (props.fontFamily) {
        loadGoogleFont(props.fontFamily).then(() => {
          const reflow = (o: any) => {
            if (o && o.fontFamily === props.fontFamily) {
              // Chromium caches font resolution per 2D context and font string:
              // a cache canvas that painted the fallback while the webfont was
              // still in flight keeps resolving to the fallback forever. Drop
              // the cache canvas so fabric creates a fresh context that picks
              // up the now-loaded face.
              o._cacheCanvas = undefined;
              o._cacheContext = undefined;
              o.initDimensions?.();
              o.dirty = true;
              o.setCoords?.();
            }
          };
          const cur = canvas.getActiveObject() as any;
          if (cur?.type === 'activeselection') (cur.getObjects?.() ?? []).forEach(reflow);
          else reflow(cur);
          canvas.requestRenderAll();
        });
      }
      pushSnapshot();
    },
    deleteActiveObject: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const targets = canvas.getActiveObjects();
      if (targets.length === 0) return;
      targets.forEach((o: any) => canvas.remove(o));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      pushSnapshot();
    },
    bringForward: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      const objects = canvas.getObjects();
      const idx = objects.indexOf(active);
      if (idx < objects.length - 1) {
        (canvas as any).moveObjectTo(active, idx + 1);
        canvas.requestRenderAll();
        pushSnapshot();
      }
    },
    sendBack: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      const objects = canvas.getObjects();
      const idx = objects.indexOf(active);
      if (idx > 0) {
        (canvas as any).moveObjectTo(active, idx - 1);
        canvas.requestRenderAll();
        pushSnapshot();
      }
    },
    getActiveObject: () => {
      const canvas = fabricRef.current;
      if (!canvas) return null;
      const active = canvas.getActiveObject();
      return active ? active.toObject([...FABRIC_EXPORT_PROPS]) : null;
    },
    addShape: (shape: string) => {
      // forward to internal helper
      addShape(shape);
    },
    addCountdown: () => {
      addElement('countdown');
    },
    addGuestbook: () => {
      addElement('guestbook');
    },
    addText: (text?: string, opts?: Record<string, any>) => {
      addText(text, opts);
    },
    enterTextTool: () => {
      enterTextTool();
    },
    exitTextTool: () => {
      exitTextTool();
    },
    enterLineTool: () => {
      enterLineTool();
    },
    exitLineTool: () => {
      exitLineTool();
    },
    uploadImage: () => {
      triggerImageUpload();
    },
    addImageFromUrl: (url: string) => {
      addImageFromUrl(url);
    },
    addMusicFromUrl: (url: string) => {
      addMusicFromUrl(url);
    },
    uploadMusic: () => {
      triggerMusicUpload();
    },
    playMusic: () => setMusicPlaying(true),
    pauseMusic: () => setMusicPlaying(false),
    getMusicUrl: () => musicUrl,
    isMusicUploading: () => musicUploadingRef.current,
    addBorder: (url: string) => {
      addBorder(url);
    },
    setBackgroundColor: (color: string, scope: BackgroundScope = 'current') => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      bgFlatColorRef.current = color;
      canvas.backgroundColor = color;
      // A flat color replaces any uploaded background texture — otherwise the
      // image would keep covering the color and the change would be invisible.
      canvas.backgroundImage = undefined;
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      // Only spread to the other pages when the caller asked to apply to all.
      if (scope === 'all') {
        const patch = { backgroundColor: color, backgroundImage: undefined };
        globalBgRef.current = patch;
        applyBgToOtherPages(patch);
      }
    },
    // Set an uploaded image as the page background. `opts` mirrors the PowerPoint
    // "Format Background" controls (fit / tile / scale / offset / transparency /
    // mirror). By default it affects only the active page; pass scope 'all' to
    // apply it to every page. Passing null removes it. The live canvas only holds
    // the active page, so the other pages get the background patched into their
    // stored JSON and pick it up when loaded.
    setBackgroundImage: (url: string | null, opts?: BackgroundOptions, scope: BackgroundScope = 'current') => {
      const canvas = fabricRef.current;
      const fabric = fabricModuleRef.current;
      if (!canvas || !fabric) return;

      if (!url) {
        canvas.backgroundImage = undefined;
        canvas.backgroundColor = bgFlatColorRef.current;
        canvas.requestRenderAll();
        pushSnapshot();
        saveCurrentPage(currentPageRef.current);
        if (scope === 'all') {
          // Cancelling the whole-invitation background: clear it everywhere and
          // forget it so pages created later start blank again.
          globalBgRef.current = null;
          applyBgToOtherPages({ backgroundImage: undefined, backgroundColor: bgFlatColorRef.current });
        }
        return;
      }

      const {
        fit = 'cover',
        tile = false,
        scaleX: uScaleX = 1,
        scaleY: uScaleY = 1,
        offsetX = 0,
        offsetY = 0,
        opacity = 1,
        flipX = false,
        flipY = false,
      } = opts ?? {};

      const w = (canvas.width as number) ?? CANVAS_REF_WIDTH;
      const h = (canvas.height as number) ?? CANVAS_REF_HEIGHT;
      const imgOpts = imageLoadOpts(url);

      fabric.Image.fromURL(url, imgOpts).then((img: any) => {
        const el = img.getElement?.() as HTMLImageElement | null;
        const natW = (el?.naturalWidth ?? 0) > 0 ? el!.naturalWidth : (img.width || 1);
        const natH = (el?.naturalHeight ?? 0) > 0 ? el!.naturalHeight : (img.height || 1);

        if (tile) {
          // Repeat the picture as a texture. The original image stays the pattern
          // source (so it round-trips by URL and stays re-editable); scale, offset
          // and mirror are all expressed in patternTransform — a negative scale on
          // an axis flips that axis — so the settings can be read straight back.
          const source = (el ?? img) as CanvasImageSource;
          const pattern = new fabric.Pattern({
            source,
            repeat: 'repeat',
            patternTransform: [
              flipX ? -uScaleX : uScaleX, 0,
              0, flipY ? -uScaleY : uScaleY,
              offsetX, offsetY,
            ],
          });
          canvas.backgroundImage = undefined;
          canvas.backgroundColor = pattern;
          canvas.requestRenderAll();
          pushSnapshot();
          saveCurrentPage(currentPageRef.current);
          if (scope === 'all') {
            const patch = { backgroundImage: undefined, backgroundColor: pattern.toObject() };
            globalBgRef.current = patch;
            applyBgToOtherPages(patch);
          }
          return;
        }

        // Single picture sized to the page. `fit` sets the base scale, the user
        // multipliers layer on top, and the image is centered + nudged by offset.
        let baseX: number;
        let baseY: number;
        if (fit === 'stretch') {
          baseX = w / natW;
          baseY = h / natH;
        } else {
          const s = fit === 'contain'
            ? Math.min(w / natW, h / natH)
            : Math.max(w / natW, h / natH);
          baseX = s;
          baseY = s;
        }
        img.set({
          originX: 'center', originY: 'center',
          left: w / 2 + offsetX, top: h / 2 + offsetY,
          scaleX: baseX * uScaleX, scaleY: baseY * uScaleY,
          opacity, flipX, flipY,
        });
        // Stash the panel-facing settings so getBackground can read them back
        // exactly (the raw fabric transform alone can't tell us the chosen fit).
        img.bgMeta = {
          fit, tile: false,
          scaleX: uScaleX, scaleY: uScaleY,
          offsetX, offsetY, opacity, flipX, flipY,
        } as BackgroundOptions;
        canvas.backgroundImage = img;
        // Keep the flat color behind the picture so 'contain' shows a backdrop.
        canvas.backgroundColor = bgFlatColorRef.current;
        canvas.requestRenderAll();
        pushSnapshot();
        saveCurrentPage(currentPageRef.current);
        if (scope === 'all') {
          const patch = {
            backgroundImage: img.toObject([...FABRIC_EXPORT_PROPS]),
            backgroundColor: bgFlatColorRef.current,
          };
          globalBgRef.current = patch;
          applyBgToOtherPages(patch);
        }
      }).catch((err: any) => console.error('Failed to load background image', err));
    },
    getBackground: (): BackgroundReadback => {
      const canvas = fabricRef.current;
      if (!canvas) return { kind: 'none' };

      // A single picture lives on backgroundImage and carries its panel settings
      // in bgMeta (serialized via FABRIC_EXPORT_PROPS, so it survives reloads).
      const bgImg = canvas.backgroundImage as any;
      if (bgImg) {
        const src = bgImg.getSrc?.() ?? bgImg._element?.src ?? null;
        if (src) {
          const meta = (bgImg.bgMeta ?? {}) as BackgroundOptions;
          return { kind: 'image', src, opts: { ...meta, tile: false } };
        }
      }

      const bgColor = canvas.backgroundColor as any;
      // A tiled picture lives on backgroundColor as a Pattern; scale/offset/mirror
      // are read straight off its transform matrix [a,b,c,d,e,f].
      if (bgColor && typeof bgColor === 'object') {
        const el = bgColor.source as any;
        const src = el?.src ?? el?.currentSrc ?? null;
        if (src) {
          const pt = bgColor.patternTransform ?? [1, 0, 0, 1, 0, 0];
          const a = pt[0] ?? 1;
          const d = pt[3] ?? 1;
          return {
            kind: 'image',
            src,
            opts: {
              tile: true,
              scaleX: Math.abs(a) || 1,
              scaleY: Math.abs(d) || 1,
              offsetX: pt[4] ?? 0,
              offsetY: pt[5] ?? 0,
              flipX: a < 0,
              flipY: d < 0,
              opacity: 1,
            },
          };
        }
      }

      if (typeof bgColor === 'string' && bgColor) return { kind: 'color', color: bgColor };
      return { kind: 'none' };
    },
    previewAnimation: (type: string) => {
      previewAnimation(type);
    },
    getActiveImageSrc: () => {
      const canvas = fabricRef.current;
      if (!canvas) return null;
      const obj = canvas.getActiveObject();
      if (!obj || (obj as any).type !== 'image') return null;
      editingImageRef.current = obj;
      // Prioritize _editedSrc (which contains the full edited image dataUrl)
      // over src (which might be just a file path or truncated)
      return (obj as any)._editedSrc ?? (obj as any).getSrc?.() ?? (obj as any)._element?.src ?? (obj as any).src ?? null;
    },
    isActiveObjectImage: () => {
      const canvas = fabricRef.current;
      const obj = canvas?.getActiveObject();
      return !!obj && (obj as any).type === 'image';
    },
    replaceActiveImage: (dataUrl: string) => {
      const obj = editingImageRef.current ?? fabricRef.current?.getActiveObject();
      replaceObjectImage(obj, dataUrl);
    },
    getProjectData: () => {
      const canvas = fabricRef.current;
      const currentJson = canvas ? serializeCanvas(canvas) : null;
      const exportedPages = pages.map((page, index) =>
        index === currentPage ? (currentJson ?? page ?? null) : (page ?? null)
      );
      // Saved into designs.json_data.canvas alongside the pages — no schema or
      // migration needed, and records without it read back as "page".
      return { pages: exportedPages, currentPage, musicUrl, presentationMode };
    },
    getPresentationMode: () => presentationModeRef.current,
    setPresentationMode: (mode: PresentationMode) => {
      const next = normalizePresentationMode(mode);
      if (next === presentationModeRef.current) return;
      presentationModeRef.current = next;
      setPresentationModeState(next);
      props.onPresentationModeChange?.(next);
      // Mark the design dirty so the existing autosave persists the setting —
      // no separate save path. The canvas itself is deliberately untouched.
      props.onCanvasChange?.();
    },
    getThumbnail: () => {
      const canvas = fabricRef.current;
      if (!canvas) return "";
      try {
        // Lightweight: small multiplier + JPEG keeps the dataURL to a few KB.
        // withFabricPainting puts animated GIFs back on the canvas for the
        // capture — they're normally drawn by a DOM layer that toDataURL can't
        // see, so without it each one would come out as a hole.
        return withGifsOnCanvas(() =>
          canvas.toDataURL({ format: "jpeg", quality: 0.6, multiplier: 0.25 }),
        );
      } catch (e) {
        console.error("[CanvasEditor] thumbnail export failed", e);
        return "";
      }
    },

    // ── Layer tab ───────────────────────────────────────────────────────────
    getLayers: () => {
      const isCurrentEnvelope = isCurrentPageEnvelope();
      const canvas = fabricRef.current;
      if (!canvas) return [];
      // Borders are managed separately (single, non-interactive, pinned to back).
      const objs = canvas.getObjects().filter((o: any) => !o.isBorder);
      objs.forEach((o: any) => { if (!o.id) o.id = genLayerId(); });
      // Number duplicate labels (e.g. two "Rectangle" → "Rectangle 1/2").
      const totals: Record<string, number> = {};
      objs.forEach((o: any) => { const b = baseLayerLabel(o); totals[b] = (totals[b] ?? 0) + 1; });
      const seen: Record<string, number> = {};
      return objs.map((o: any) => {
        const base = baseLayerLabel(o);
        let label = base;
        if (totals[base] > 1) { seen[base] = (seen[base] ?? 0) + 1; label = `${base} ${seen[base]}`; }
        return {
          id: o.id as string,
          type: String(o.type ?? ""),
          label,
          visible: o.visible !== false,
          locked: !!o.locked,
          isImage: o.type === "image",
          isEnvelope: isCurrentEnvelope && isEnvelopeObj(o),
        };
      });
    },
    selectLayer: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o: any) => o.id === id) as any;
      if (!obj || obj.selectable === false) return;
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      updateOverlayFromActive();
      // setActiveObject doesn't fire selection events, so push the snapshot manually.
      props.onSelectionChange?.(obj.toObject([...SELECTION_PROPS]));
      onLayersChangeRef.current?.();
    },
    moveLayerUp: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const objs = canvas.getObjects();
      const obj = objs.find((o: any) => o.id === id);
      if (!obj) return;
      const idx = objs.indexOf(obj);
      if (idx >= objs.length - 1) return; // already top-most
      (canvas as any).moveObjectTo(obj, idx + 1);
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    moveLayerDown: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const objs = canvas.getObjects();
      const obj = objs.find((o: any) => o.id === id);
      if (!obj) return;
      const idx = objs.indexOf(obj);
      // Don't drop behind a pinned border (lowest non-border slot is the floor).
      const floor = Math.max(0, objs.findIndex((o: any) => !(o as any).isBorder));
      if (idx <= floor) return;
      (canvas as any).moveObjectTo(obj, idx - 1);
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    moveLayerToFront: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const objs = canvas.getObjects();
      const obj = objs.find((o: any) => o.id === id);
      if (!obj) return;
      (canvas as any).moveObjectTo(obj, objs.length - 1);
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    moveLayerToBack: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const objs = canvas.getObjects();
      const obj = objs.find((o: any) => o.id === id);
      if (!obj) return;
      const floor = Math.max(0, objs.findIndex((o: any) => !(o as any).isBorder));
      (canvas as any).moveObjectTo(obj, floor);
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    // Drop a layer at an arbitrary canvas stacking index (used by drag-and-drop
    // reordering in the Layers panel). The index is clamped so it never sinks
    // below a pinned border or past the top of the stack.
    moveLayerTo: (id: string, canvasIndex: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const objs = canvas.getObjects();
      const obj = objs.find((o: any) => o.id === id);
      if (!obj) return;
      const floor = Math.max(0, objs.findIndex((o: any) => !(o as any).isBorder));
      const target = Math.min(objs.length - 1, Math.max(floor, canvasIndex));
      if (target === objs.indexOf(obj)) return;
      (canvas as any).moveObjectTo(obj, target);
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    toggleLayerVisibility: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o: any) => o.id === id) as any;
      if (!obj) return;
      obj.visible = obj.visible === false;
      if (!obj.visible && canvas.getActiveObject() === obj) {
        canvas.discardActiveObject();
        props.onSelectionChange?.(null);
      }
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    toggleLayerLock: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o: any) => o.id === id) as any;
      if (!obj) return;
      const locked = !obj.locked;
      obj.locked = locked;
      obj.selectable = !locked;
      obj.evented = !locked;
      obj.lockMovementX = locked;
      obj.lockMovementY = locked;
      obj.lockScalingX = locked;
      obj.lockScalingY = locked;
      obj.lockRotation = locked;
      obj.hasControls = !locked;
      if (locked && canvas.getActiveObject() === obj) {
        canvas.discardActiveObject();
        props.onSelectionChange?.(null);
      }
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    renameLayer: (id: string, name: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o: any) => o.id === id) as any;
      if (!obj) return;
      const next = name.trim();
      // Empty name clears the custom label so it falls back to text/type.
      obj.name = next || undefined;
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      onLayersChangeRef.current?.();
    },
    deleteLayer: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find((o: any) => o.id === id) as any;
      if (!obj) return;
      // Prevent deletion of envelope elements on the envelope page
      if (isCurrentPageEnvelope() && isEnvelopeObj(obj)) {
        alert("Envelope elements cannot be deleted. You can only change their color and texture.");
        return;
      }
      if (canvas.getActiveObject() === obj) {
        canvas.discardActiveObject();
        props.onSelectionChange?.(null);
      }
      canvas.remove(obj);
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      setOverlay(null);
      onLayersChangeRef.current?.();
    },
    goToPage,
    reorderPages: (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return;
      // Envelope page cannot be moved — prevent reordering if envelope is involved
      if (isEnvelopePage(from) || isEnvelopePage(to)) {
        alert("The envelope page cannot be reordered. It must remain as the first page.");
        return;
      }
      const canvas = fabricRef.current;
      if (!canvas) return;
      flushPending();
      const currentJson = serializeCanvas(canvas);
      const updated = [...pages];
      updated[currentPageRef.current] = currentJson;
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      const cur = currentPageRef.current;
      let newCurrent = cur;
      if (cur === from) {
        newCurrent = to;
      } else if (from < cur && to >= cur) {
        newCurrent = cur - 1;
      } else if (from > cur && to <= cur) {
        newCurrent = cur + 1;
      }
      historiesRef.current.clear();
      currentPageRef.current = newCurrent;
      setPages(updated);
      setCurrentPage(newCurrent);
    },
    addPage: () => addPage(),
    removePage: (opts?: { skipConfirm?: boolean }) => removePage(opts),
    getPageCount: () => pages.length,
    getCurrentPageIndex: () => currentPage,
    canDeleteCurrentPage: () => pages.length > 1 && !isCurrentPageEnvelope(),
  }));

  useEffect(() => {
    if (!canvasEl.current) return;
    if (fabricRef.current) return;
    // Guard against the canvas DOM element already being claimed by a prior
    // fabric instance (e.g. StrictMode double-invoke or a pending async init
    // from a previous mount). Fabric stamps `__fabric` on the element.
    if ((canvasEl.current as any).__fabric) return;

    let mounted = true;
    const elAtMount = canvasEl.current;
    let cleanupResize: (() => void) | null = null;
    let cleanupKeyboard: (() => void) | null = null;
    let cleanupWheel: (() => void) | null = null;
    let cleanupPrePress: (() => void) | null = null;

    async function init() {
      try {
        const mod = await import("fabric");
        if (!mounted) return;
        const fabric = ((mod as any).fabric ?? (mod as any).default ?? mod) as any;
        fabricModuleRef.current = fabric;

        // ── Corner rotation controls (Figma / Canva style) ──────────────────
        // Fabric v7 renamed Object → FabricObject; support both.
        try {
          const FabricProto = (fabric.FabricObject ?? fabric.Object)?.prototype;
          const controlsUtils = fabric.controlsUtils;
          const ControlCtor = fabric.Control;

          if (FabricProto?.controls && controlsUtils && ControlCtor) {
            // Hide the default tall top-centre rotation handle.
            if (FabricProto.controls.mtr) FabricProto.controls.mtr.visible = false;

            // Small curved-arrow icon drawn with Canvas 2D.
            const renderRotateIcon = (ctx: CanvasRenderingContext2D, left: number, top: number) => {
              ctx.save();
              ctx.translate(left, top);
              ctx.beginPath();
              ctx.arc(0, 0, 9, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = 'rgba(0,0,0,0.18)';
              ctx.shadowBlur = 4;
              ctx.fill();
              ctx.shadowBlur = 0;
              ctx.strokeStyle = '#7D5B59';
              ctx.lineWidth = 1.2;
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(0, 0.5, 4, Math.PI * 0.2, Math.PI * 1.8);
              ctx.strokeStyle = '#7D5B59';
              ctx.lineWidth = 1.8;
              ctx.lineCap = 'round';
              ctx.stroke();
              const ang = Math.PI * 1.8;
              const ex = 4 * Math.cos(ang), ey = 0.5 + 4 * Math.sin(ang);
              ctx.beginPath();
              ctx.moveTo(ex, ey);
              ctx.lineTo(ex - 2.5, ey + 0.5);
              ctx.moveTo(ex, ey);
              ctx.lineTo(ex + 0.5, ey - 2.5);
              ctx.lineWidth = 1.8;
              ctx.stroke();
              ctx.restore();
            };

            const R = 16;
            [
              { name: 'tlRotate', x: -0.5, y: -0.5, ox: -R, oy: -R },
              { name: 'trRotate', x:  0.5, y: -0.5, ox:  R, oy: -R },
              { name: 'brRotate', x:  0.5, y:  0.5, ox:  R, oy:  R },
              { name: 'blRotate', x: -0.5, y:  0.5, ox: -R, oy:  R },
            ].forEach(({ name, x, y, ox, oy }) => {
              FabricProto.controls[name] = new ControlCtor({
                x, y,
                offsetX: ox,
                offsetY: oy,
                cursorStyleHandler: controlsUtils.rotationStyleHandler,
                actionHandler: controlsUtils.rotationWithSnapping,
                actionName: 'rotate',
                render: renderRotateIcon,
                cornerSize: 18,
              });
            });
          }
        } catch (e) {
          console.warn('Corner rotation controls setup failed:', e);
        }
        // ────────────────────────────────────────────────────────────────────

        if ((elAtMount as any).__fabric) return;

        const canvas = new fabric.Canvas(elAtMount, {
          preserveObjectStacking: true,
          backgroundColor: "#ffffff",
          // NOTE: stopContextMenu must stay false. When true, Fabric calls
          // e.stopPropagation() on the native contextmenu event, which prevents
          // it from ever bubbling to React's delegated listener — so our
          // onContextMenu handler (which opens the menu) never fires. We
          // preventDefault ourselves in handleCanvasContextMenu instead.
          fireRightClick: false,
          stopContextMenu: false,
        });

        gifOverlayRef.current = createGifOverlay(canvas);

        canvas.on('mouse:down', (opt: any) => {
          if (opt?.e?.button !== 2) return;
          const target = opt.target;
          if (!target) {
            setContextMenu(null);
            return;
          }
          // computeGroupFlags preserves an existing multi-selection (so Group stays
          // available) and otherwise makes `target` active.
          const flags = computeGroupFlags(target);
          canvas.requestRenderAll();
          setContextMenu({
            x: opt.e.clientX,
            y: opt.e.clientY,
            hidden: target.visible === false,
            isImage: target.type === 'image',
            ...flags,
          });
        });

        // initial size — use explicit pixel dimensions so Fabric can render correctly
        const initialWidth = CANVAS_REF_WIDTH;
        const initialHeight = CANVAS_REF_HEIGHT;
        canvas.setDimensions({ width: initialWidth, height: initialHeight });
        fabricRef.current = canvas;
        if (process.env.NODE_ENV === 'development') (window as any).__canvas = canvas;

        // Load first page after canvas is ready. replaceCanvasContent guards the restore
        // flag so object:added events fired during enliven don't enter history.
        setTimeout(() => {
          const initialPage = pages[0] ?? null;
          replaceCanvasContent(initialPage, () => {
            // Seed baseline history for page 0 so the first undo has something to step back to.
            commitSnapshot();
            hasHydratedRef.current = true;
            setFirstPagePainted(true);
          });
        }, 0);

        // Layout handler: size the artboard (CSS only) to fit the workspace,
        // preserving aspect ratio, then multiply by the editor zoom so the whole
        // sheet — canvas element and the floating footer pinned to it — grows or
        // shrinks as one piece. Backstore dimensions stay at
        // initialWidth x initialHeight, so object coordinates, snapshots and the
        // exported invitation are all completely unaffected by zoom.
        //
        // The available space is read from the WORKSPACE (the non-scrolling frame),
        // not from the scroll viewport inside it: at zoom > 1 the artboard overflows
        // and scrollbars appear, and measuring the scrolled box would shrink the
        // fit, which could hide the scrollbars again — a layout feedback loop.
        const resizeCanvas = () => {
          const el = canvasEl.current;
          if (!el || !fabricRef.current) return;
          // el.parentElement is fabric's .canvas-container; its parent is the
          // stage that centres it inside the scroll viewport.
          const stage = el.parentElement?.parentElement;
          const workspace = workspaceRef.current;
          if (!stage || !workspace) return;
          const availW = workspace.clientWidth;
          const availH = workspace.clientHeight;
          if (availW <= 0 || availH <= 0) return;
          const fit = Math.min(availW / initialWidth, availH / initialHeight);
          if (!isFinite(fit) || fit <= 0) return;
          const scale = fit * zoomRef.current;
          // Floor so a 100% artboard is never a sub-pixel wider than the viewport
          // (which would raise scrollbars over a rounding error).
          const displayW = Math.floor(initialWidth * scale);
          const displayH = Math.floor(initialHeight * scale);
          fabricRef.current.setDimensions(
            { width: displayW, height: displayH },
            { cssOnly: true }
          );
          // Record where the canvas actually renders inside the stage so the
          // floating footer can be pinned to its bottom edge at the same scale.
          // Both rects scroll together, so the offsets stay valid while panning.
          const container = el.parentElement; // fabric's .canvas-container
          const stageRect = stage.getBoundingClientRect();
          const cRect = (container ?? el).getBoundingClientRect();
          setCanvasBox({
            left: cRect.left - stageRect.left,
            top: cRect.top - stageRect.top,
            width: displayW,
            height: displayH,
            scale,
          });
        };
        fitCanvasRef.current = resizeCanvas;

        // run once, on window resize, and whenever the workspace changes size
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        const wrapEl = workspaceRef.current;
        const resizeObs = wrapEl ? new ResizeObserver(() => resizeCanvas()) : null;
        if (wrapEl && resizeObs) resizeObs.observe(wrapEl);
        cleanupResize = () => {
          window.removeEventListener('resize', resizeCanvas);
          resizeObs?.disconnect();
        };

        // Fabric fires object:added/modified/removed on user edits. We debounce so
        // rapid bursts (drag, resize, multi-select move) collapse to one history entry.
        const onChange = () => {
          if (isRestoringRef.current) return;
          schedulePush();
          saveCurrentPage(currentPageRef.current);
          onCanvasChangeRef.current?.();
          onLayersChangeRef.current?.();
        };

        // Stamp a stable id on every object as it enters the canvas (including
        // during page/template restore) so the Layer tab has a reliable React key.
        canvas.on("object:added", (e: any) => {
          const o = e?.target;
          if (o && !o.id) o.id = genLayerId();
        });

        canvas.on("object:added", onChange);
        canvas.on("object:modified", onChange);
        canvas.on("object:removed", onChange);

        // selection change -> notify parent (if provided)
        const onSelectionChange = () => {
          const active = canvas.getActiveObject();
          if (typeof props.onSelectionChange === "function") {
            const obj = active
              ? active.toObject([
                  'type',
                  'left',
                  'top',
                  'scaleX',
                  'scaleY',
                  'angle',
                  'fill',
                  'fontSize',
                  'text',
                  'width',
                  'height',
                  ...FABRIC_EXPORT_PROPS,
                ])
              : null;
            props.onSelectionChange(obj);
          }
        };

        // Abort any in-flight animation preview and restore its object — keeps a
        // looping preview from continuing once the user picks a different element.
        const stopPreview = () => {
          if (previewRafRef.current != null) { cancelAnimationFrame(previewRafRef.current); previewRafRef.current = null; }
          if (previewRestoreRef.current) { previewRestoreRef.current(); previewRestoreRef.current = null; }
        };

        canvas.on('selection:created', () => { stopPreview(); onSelectionChange(); updateOverlayFromActive(); onLayersChangeRef.current?.(); });
        canvas.on('selection:updated', () => { stopPreview(); onSelectionChange(); updateOverlayFromActive(); onLayersChangeRef.current?.(); });
        canvas.on('selection:cleared', () => { stopPreview(); onSelectionChange(); setOverlay(null); onLayersChangeRef.current?.(); });

        // Keep the overlay in sync while objects move/transform
        canvas.on('object:moving', () => { onSelectionChange(); updateOverlayFromActive(); });
        canvas.on('object:scaling', () => { onSelectionChange(); updateOverlayFromActive(); });
        canvas.on('object:rotating', () => { onSelectionChange(); updateOverlayFromActive(); });
        canvas.on('object:modified', () => { onSelectionChange(); updateOverlayFromActive(); });

        // Double-click on a textbox: auto-fit the box width to the text content.
        canvas.on('mouse:dblclick', (opt: any) => {
          const obj = opt?.target;
          if (!obj) return;
          const t = (obj.type ?? '').toLowerCase();
          if (t !== 'textbox' && t !== 'text' && t !== 'i-text') return;
          const ctx = (canvas as any).getContext?.() ?? (canvas as any).contextContainer;
          if (!ctx) return;
          ctx.font = `${obj.fontWeight ?? 'normal'} ${obj.fontSize ?? 24}px ${obj.fontFamily ?? 'Arial'}`;
          const lines = (obj.text ?? '').split('\n');
          let maxW = 0;
          for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxW) maxW = w;
          }
          const padding = (obj.padding ?? 0) * 2;
          const newWidth = Math.ceil(maxW) + padding + 4;
          obj.set({ width: newWidth, scaleX: 1 });
          obj.initDimensions?.();
          obj.setCoords?.();
          canvas.requestRenderAll();
          schedulePush();
          updateOverlayFromActive();
          onSelectionChange();
        });

        // Alt + drag to duplicate (Figma-style): clone stays at origin, active object is dragged
        let altCloneDone = false;
        canvas.on('object:moving', (opt: any) => {
          const e = opt.e as MouseEvent;
          if (!e.altKey) { altCloneDone = false; return; }
          if (altCloneDone) return;
          const obj = opt.target;
          if (!obj) return;
          altCloneDone = true;
          const origLeft = opt.transform?.original?.left ?? obj.left;
          const origTop = opt.transform?.original?.top ?? obj.top;
          obj.clone().then((cloned: any) => {
            cloned.set({ left: origLeft, top: origTop });
            canvas.add(cloned);
            canvas.requestRenderAll();
          });
        });
        canvas.on('mouse:up', () => {
          if (altCloneDone) { altCloneDone = false; schedulePush(); }
        });

        // ── Smart guides (advanced) ──────────────────────────────────────────
        // During a drag or resize we compute alignment / gap / equal-spacing /
        // canvas-center guides (with snapping + hysteresis) and stash them in a
        // ref; they're painted in `after:render` and cleared when the gesture
        // ends. Works for single objects, groups (one box) and multi-selections
        // (the ActiveSelection box). Hold Alt to suspend snapping (guides still
        // show). See src/lib/smartGuides.ts for all the tunable constants.
        const clearSmartGuides = () => {
          if (smartGuidesRef.current.length) {
            smartGuidesRef.current = [];
            canvas.requestRenderAll();
          }
        };
        // Drop the snap memory + reference-box cache at the end of a gesture or
        // whenever the set of objects / selection changes.
        const resetSmartGuideMemory = () => {
          prevSnapXRef.current = undefined;
          prevSnapYRef.current = undefined;
          refBoxesCacheRef.current = null;
        };
        // Reference boxes for the current gesture, cached per moved object so a
        // 100-element page isn't re-scanned on every mouse-move.
        const refBoxesFor = (obj: any): Box[] => {
          const cache = refBoxesCacheRef.current;
          if (cache && cache.owner === obj) return cache.boxes;
          const fresh = { owner: obj, boxes: getReferenceBoxes(canvas, obj) };
          refBoxesCacheRef.current = fresh;
          return fresh.boxes;
        };

        canvas.on('object:moving', (opt: any) => {
          const obj = opt?.target;
          if (!obj) { smartGuidesRef.current = []; return; }
          obj.setCoords?.();
          const movingBox = getElementBox(obj);
          if (!movingBox) { smartGuidesRef.current = []; return; }

          const altDown = !!opt?.e?.altKey; // DISABLE_SNAPPING_MODIFIER
          const res = computeMoveGuides({
            moving: movingBox,
            others: refBoxesFor(obj),
            canvasBox: getCanvasBox(canvas),
            enableSnapping: ENABLE_SMART_SNAPPING && !altDown,
            prev: { x: prevSnapXRef.current, y: prevSnapYRef.current },
          });

          // Apply the snap delta to the moved object (for an ActiveSelection this
          // shifts the whole group, preserving members' relative layout).
          if (res.dx) obj.left = (obj.left ?? 0) + res.dx;
          if (res.dy) obj.top = (obj.top ?? 0) + res.dy;
          if (res.dx || res.dy) obj.setCoords?.();
          prevSnapXRef.current = res.snap.x;
          prevSnapYRef.current = res.snap.y;
          smartGuidesRef.current = res.guides;
        });

        canvas.on('object:scaling', (opt: any) => {
          const obj = opt?.target;
          // Resize guides for single objects only (multi-select resize stays free).
          if (!obj || obj.type === 'activeselection' || obj.type === 'activeSelection') { smartGuidesRef.current = []; return; }
          obj.setCoords?.();
          const box = getElementBox(obj);
          if (!box) { smartGuidesRef.current = []; return; }

          const altDown = !!opt?.e?.altKey;
          const corner = String(opt?.transform?.corner ?? '');
          const res = computeResizeGuides({
            box,
            corner,
            others: refBoxesFor(obj),
            canvasBox: getCanvasBox(canvas),
          });

          // Snap the resized edges only when it's safe to map them onto scale:
          // snapping on, not Alt, axis-aligned, default origin, not flipped.
          const canSnap =
            ENABLE_RESIZE_SNAPPING && ENABLE_SMART_SNAPPING && !altDown &&
            Math.abs((obj.angle ?? 0) % 360) < 0.001 &&
            (obj.originX ?? 'left') === 'left' && (obj.originY ?? 'top') === 'top' &&
            obj.flipX !== true && obj.flipY !== true;
          if (canSnap) {
            const baseW = (obj.width ?? 0) || 1;
            const baseH = (obj.height ?? 0) || 1;
            const t = res.targets;
            if (t.right != null) { const w = Math.max(MIN_ELEMENT_WIDTH, t.right - box.left); obj.scaleX = w / baseW; }
            if (t.left != null) { const w = Math.max(MIN_ELEMENT_WIDTH, box.right - t.left); obj.scaleX = w / baseW; obj.left = box.right - w; }
            if (t.bottom != null) { const h = Math.max(MIN_ELEMENT_HEIGHT, t.bottom - box.top); obj.scaleY = h / baseH; }
            if (t.top != null) { const h = Math.max(MIN_ELEMENT_HEIGHT, box.bottom - t.top); obj.scaleY = h / baseH; obj.top = box.bottom - h; }
            obj.setCoords?.();
          }
          smartGuidesRef.current = res.guides;
        });

        // Paint the guides on top of the rendered objects. Runs every frame while
        // interacting (Fabric re-renders each move/scale); a no-op when empty.
        canvas.on('after:render', (opt: any) => {
          const guides = smartGuidesRef.current;
          if (!guides.length) return;
          const ctx = (opt?.ctx ?? (canvas as any).contextContainer) as CanvasRenderingContext2D | undefined;
          if (!ctx) return;
          drawSmartGuides(ctx, guides, canvas.viewportTransform as number[]);
        });

        // Guides exist only during an active gesture.
        canvas.on('mouse:up', () => { clearSmartGuides(); resetSmartGuideMemory(); });
        canvas.on('object:modified', clearSmartGuides);
        canvas.on('object:rotating', clearSmartGuides);
        // Selection / object-set changes invalidate the snap memory + box cache.
        canvas.on('selection:cleared', () => { clearSmartGuides(); resetSmartGuideMemory(); });
        canvas.on('selection:created', resetSmartGuideMemory);
        canvas.on('selection:updated', resetSmartGuideMemory);
        canvas.on('object:added', resetSmartGuideMemory);
        canvas.on('object:removed', resetSmartGuideMemory);

        // ── Phone: swipe the canvas sideways to change page ─────────────────
        // Swipe left for the next page, right for the previous one; at either
        // end of the deck nothing happens. Screen coordinates, not scene ones,
        // so the threshold means the same thing at any zoom/fit. The edge
        // strips sit above the canvas in the DOM, so their hold-and-swipe never
        // reaches fabric and the two gestures can't collide.
        //
        // Most pages are covered edge to edge by an element (the envelope, a
        // full-bleed background), so requiring bare canvas would make the
        // gesture unusable exactly where it's needed. Instead the swipe wins
        // over an element that ISN'T selected yet: fabric would start dragging
        // it the moment the finger moves, so its movement is pinned for the
        // duration of the press and restored on release. Tap to select, then
        // drag — an already-selected element is still dragged straight away.
        const SWIPE_NAV_PX = 60;   // sideways travel that counts as a swipe
        const SWIPE_NAV_MS = 700;  // slower than this is a drag, not a swipe
        const isPhoneViewport = () =>
          typeof window !== 'undefined' &&
          window.matchMedia('(max-width: 499px)').matches;
        // Fabric hands us the raw DOM event, which is a pointer event on some
        // paths and a touch event on others.
        const clientPointOf = (e: any) => {
          const t = e?.touches?.[0] ?? e?.changedTouches?.[0];
          return { x: t?.clientX ?? e?.clientX ?? 0, y: t?.clientY ?? e?.clientY ?? 0 };
        };

        // The element whose movement is pinned for the current press, with the
        // lock flags it had before, so they can be handed straight back.
        let pinned: { obj: any; lockX: boolean; lockY: boolean } | null = null;
        const unpinSwipeTarget = () => {
          if (!pinned) return;
          pinned.obj.lockMovementX = pinned.lockX;
          pinned.obj.lockMovementY = pinned.lockY;
          pinned = null;
        };

        const isPartOfSelection = (target: any, active: any) =>
          !!target &&
          !!active &&
          (target === active || !!active._objects?.includes?.(target));

        // Capture phase on the document, so it runs before fabric's own
        // handler on the canvas element and sees the pre-press selection.
        const recordPrePressSelection = () => {
          prePressActiveRef.current = canvas.getActiveObject?.() ?? null;
        };
        document.addEventListener('pointerdown', recordPrePressSelection, true);
        document.addEventListener('touchstart', recordPrePressSelection, true);
        cleanupPrePress = () => {
          document.removeEventListener('pointerdown', recordPrePressSelection, true);
          document.removeEventListener('touchstart', recordPrePressSelection, true);
        };

        canvas.on('mouse:down', (opt: any) => {
          unpinSwipeTarget();
          canvasSwipeRef.current = null;
          if (!isPhoneViewport()) return;
          const active = canvas.getActiveObject?.() as any;
          // Mid-edit text swallows the gesture — the caret is the point there.
          if (active?.isEditing) return;
          const target = opt.target;
          // Was already selected before this press → the user means to move it,
          // not to turn the page.
          if (isPartOfSelection(target, prePressActiveRef.current)) return;
          if (target) {
            pinned = {
              obj: target,
              lockX: !!target.lockMovementX,
              lockY: !!target.lockMovementY,
            };
            target.lockMovementX = true;
            target.lockMovementY = true;
          }
          const p = clientPointOf(opt.e);
          canvasSwipeRef.current = { x: p.x, y: p.y, t: Date.now() };
        });

        canvas.on('mouse:up', (opt: any) => {
          unpinSwipeTarget();
          const start = canvasSwipeRef.current;
          canvasSwipeRef.current = null;
          if (!start) return;
          const p = clientPointOf(opt.e);
          const dx = p.x - start.x;
          const dy = p.y - start.y;

          // Fabric selects whatever a press lands on. A drag was never a
          // selection gesture, so give the selection back to whatever held it
          // before — otherwise the element the finger happened to cross stays
          // selected and the NEXT swipe reads as "drag my selection" instead.
          // Tap to select, then drag, is still exactly as it was.
          if (Math.hypot(dx, dy) > 10) {
            const active = canvas.getActiveObject?.();
            if (active && active !== prePressActiveRef.current) {
              canvas.discardActiveObject();
              canvas.requestRenderAll();
            }
          }

          if (Date.now() - start.t > SWIPE_NAV_MS) return;
          // Mostly horizontal, and far enough to be meant.
          if (Math.abs(dx) < SWIPE_NAV_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          const { goToPage: go, count, current, toast } = pageNavRef.current;
          const next = dx < 0 ? current + 1 : current - 1;
          // Nothing on that side of the deck — the swipe simply does nothing.
          if (next < 0 || next >= count) return;
          go(next);
          toast(`Page ${next + 1} of ${count}`);
        });

        // Text tool: click to add text at default size, drag to add textbox with that width.
        const getScenePoint = (e: any) => {
          if (typeof (canvas as any).getScenePoint === 'function') return (canvas as any).getScenePoint(e);
          if (typeof (canvas as any).getPointer === 'function') return (canvas as any).getPointer(e);
          return { x: 0, y: 0 };
        };
        canvas.on('mouse:down', (opt: any) => {
          if (!textToolRef.current) return;
          const p = opt.scenePoint ?? getScenePoint(opt.e);
          textToolStartRef.current = { x: p.x, y: p.y };
          textToolDraggedRef.current = false;
        });
        canvas.on('mouse:move', (opt: any) => {
          if (!textToolRef.current || !textToolStartRef.current) return;
          const p = opt.scenePoint ?? getScenePoint(opt.e);
          const dx = p.x - textToolStartRef.current.x;
          const dy = p.y - textToolStartRef.current.y;
          if (Math.hypot(dx, dy) > 4) textToolDraggedRef.current = true;
        });
        canvas.on('mouse:up', (opt: any) => {
          if (!textToolRef.current || !textToolStartRef.current) return;
          const fabric = fabricModuleRef.current;
          const start = textToolStartRef.current;
          const p = opt.scenePoint ?? getScenePoint(opt.e);
          const wasDragged = textToolDraggedRef.current;
          textToolStartRef.current = null;
          textToolDraggedRef.current = false;

          if (!fabric) { exitTextTool(); return; }

          const left = Math.min(start.x, p.x);
          const top = Math.min(start.y, p.y);
          const width = Math.max(40, Math.abs(p.x - start.x));

          const props: any = { left, top, fontSize: 24, fill: '#111827' };
          if (wasDragged) props.width = width;

          const textObj = new fabric.Textbox('Text', props);
          canvas.add(textObj);
          canvas.setActiveObject(textObj);
          exitTextTool();
          if (typeof (textObj as any).enterEditing === 'function') {
            (textObj as any).enterEditing();
            (textObj as any).selectAll?.();
          }
          canvas.requestRenderAll();
          schedulePush();
        });

        // Line tool — supports BOTH gestures:
        //   • press, drag, release
        //   • click, move (the line follows the cursor), click again to finish
        // The first press anchors x1/y1 and adds a live draft; mouse:move
        // stretches its x2/y2 whether or not the button is held, which is what
        // makes the click-move-click flow work with the same handler.
        const placeLineDraft = () => {
          const draft = lineDraftRef.current;
          if (!draft) return;
          lineToolStartRef.current = null;
          lineDraftRef.current = null;
          draft.set({ selectable: true, evented: true, excludeFromExport: false });
          draft.setCoords();
          canvas.setActiveObject(draft);
          exitLineTool();
          canvas.requestRenderAll();
          schedulePush();
          saveCurrentPage(currentPageRef.current);
        };
        canvas.on('mouse:down', (opt: any) => {
          if (!lineToolRef.current) return;
          const fabric = fabricModuleRef.current;
          if (!fabric) return;
          const p = opt.scenePoint ?? getScenePoint(opt.e);
          const start = lineToolStartRef.current;

          // Second click of click-move-click → finish here (ignore a click
          // that hasn't left the anchor yet, e.g. an accidental double-click).
          if (lineDraftRef.current && start) {
            if (Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
            lineDraftRef.current.set({ x2: p.x, y2: p.y });
            placeLineDraft();
            return;
          }

          lineToolStartRef.current = { x: p.x, y: p.y };
          const draft = new fabric.Line([p.x, p.y, p.x, p.y], {
            stroke: '#111827',
            strokeWidth: 3,
            strokeLineCap: 'round',
            selectable: false,
            evented: false,
            // Keep the in-progress draft out of history snapshots / page saves
            // (object:added schedules both); cleared when the line is placed.
            excludeFromExport: true,
          });
          lineDraftRef.current = draft;
          canvas.add(draft);
          canvas.requestRenderAll();
        });
        canvas.on('mouse:move', (opt: any) => {
          if (!lineToolRef.current || !lineDraftRef.current) return;
          const p = opt.scenePoint ?? getScenePoint(opt.e);
          // Setting x2/y2 re-derives the line's bounding box (fabric v7 Line._set),
          // which is safe here because the draft carries no extra transforms yet.
          lineDraftRef.current.set({ x2: p.x, y2: p.y });
          lineDraftRef.current.setCoords();
          canvas.requestRenderAll();
        });
        canvas.on('mouse:up', (opt: any) => {
          if (!lineToolRef.current || !lineDraftRef.current || !lineToolStartRef.current) return;
          const start = lineToolStartRef.current;
          const p = opt.scenePoint ?? getScenePoint(opt.e);
          // Released without dragging → the user is doing click-move-click:
          // keep the draft following the cursor until the second click.
          if (Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
          // Press-drag-release → the drag already stretched the draft; place it.
          placeLineDraft();
        });

        // Delete / Backspace key to remove the selected object; Ctrl+/- to zoom
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
          const c = fabricRef.current;
          if (!c) return;

          if ((e.ctrlKey && e.key === 'f') || e.key === 'Tab') {
            e.preventDefault();
            toggleFullscreenRef.current();
            return;
          }

          if (e.key === 'Escape' && textToolRef.current) {
            e.preventDefault();
            exitTextTool();
            return;
          }

          if (e.key === 'Escape' && lineToolRef.current) {
            e.preventDefault();
            exitLineTool();
            return;
          }

          if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            applyZoomRef.current(zoomRef.current + EDITOR_ZOOM_STEP);
            return;
          }

          if (e.ctrlKey && e.key === '-') {
            e.preventDefault();
            applyZoomRef.current(zoomRef.current - EDITOR_ZOOM_STEP);
            return;
          }

          if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            applyZoomRef.current(1);
            return;
          }

          if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
            e.preventDefault();
            // Reset the view: fabric's own transform back to identity (it is only
            // ever moved by panning, never by the editor zoom) and the artboard
            // back to its default 100% scale.
            c.setViewportTransform([1, 0, 0, 1, 0, 0]);
            applyZoomRef.current(1);
            c.requestRenderAll();
            return;
          }

          if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            if (!clipboardRef.current) return;
            clipboardRef.current.clone().then((pasted: any) => {
              pasted.set({ left: (pasted.left ?? 0) + 20, top: (pasted.top ?? 0) + 20 });
              c.add(pasted);
              c.setActiveObject(pasted);
              c.requestRenderAll();
              schedulePush();
              updateOverlayFromActive();
              if (typeof props.onSelectionChange === 'function') {
                props.onSelectionChange(pasted.toObject([...SELECTION_PROPS]));
              }
              clipboardRef.current = pasted;
            });
            return;
          }

          const active = c.getActiveObject();
          if (!active) return;
          if ((active as any).isEditing) return;

          // ── Font size shortcut (Figma-style) ──────────────────────────────
          // Ctrl/Cmd + Shift + . (or >)  → grow the selected text by 1px
          // Ctrl/Cmd + Shift + , (or <)  → shrink the selected text by 1px
          // Detect the modifier per-platform (Ctrl on Win/Linux, Meta/Cmd on
          // Mac) and accept both the shifted characters (> <) and the physical
          // keys (./, via e.code) so every keyboard layout works. Clamps to
          // 6–300px and supports a multi-text selection.
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            const grow = e.key === '.' || e.key === '>' || e.code === 'Period';
            const shrink = e.key === ',' || e.key === '<' || e.code === 'Comma';
            if (grow || shrink) {
              const isTextObj = (o: any) =>
                o && (o.type === 'textbox' || o.type === 'text' || o.type === 'i-text');
              // Support multi-select: an ActiveSelection adjusts every text child;
              // a single selection adjusts that object when it's text.
              const targets: any[] =
                (active as any).type === 'activeselection'
                  ? ((active as any).getObjects?.() ?? []).filter(isTextObj)
                  : isTextObj(active)
                  ? [active]
                  : [];
              // Not a text element — leave other handlers / the browser alone.
              if (targets.length === 0) return;
              e.preventDefault();
              const delta = grow ? 1 : -1;
              targets.forEach((o) => {
                const cur = Math.round(Number(o.fontSize ?? 24));
                const next = Math.max(6, Math.min(300, cur + delta));
                if (next !== cur) {
                  o.set('fontSize', next);
                  o.setCoords?.();
                }
              });
              c.requestRenderAll();
              schedulePush(); // feeds undo/redo, same path as the Inspector edits
              updateOverlayFromActive();
              // Refresh the Inspector so its Font Size input mirrors the change.
              if (typeof props.onSelectionChange === 'function') {
                props.onSelectionChange(active.toObject([...SELECTION_PROPS]));
              }
              return;
            }
          }

          // ── Group / Ungroup shortcuts ─────────────────────────────────────
          // Ctrl/Cmd + G groups the current multi-selection; Ctrl/Cmd + Shift +
          // G ungroups the selected group. Routes through the same doGroup /
          // doUngroup used by the context menu.
          if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
            e.preventDefault();
            if (e.shiftKey) {
              if ((active as any).type === 'group') doUngroup();
            } else if ((active as any).type === 'activeselection') {
              doGroup();
            }
            return;
          }

          if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
            e.preventDefault();
            active.clone().then((cloned: any) => {
              clipboardRef.current = cloned;
            });
            return;
          }

          if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
            e.preventDefault();
            active.clone().then((cloned: any) => {
              clipboardRef.current = cloned;
              c.getActiveObjects().forEach((o: any) => c.remove(o));
              c.discardActiveObject();
              c.requestRenderAll();
              schedulePush();
              setOverlay(null);
              if (typeof props.onSelectionChange === 'function') props.onSelectionChange(null);
            });
            return;
          }

          if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            active.clone().then((cloned: any) => {
              cloned.set({ left: (cloned.left ?? 0) + 20, top: (cloned.top ?? 0) + 20 });
              c.add(cloned);
              c.setActiveObject(cloned);
              c.requestRenderAll();
              schedulePush();
              updateOverlayFromActive();
              if (typeof props.onSelectionChange === 'function') {
                props.onSelectionChange(cloned.toObject([...SELECTION_PROPS]));
              }
            });
            return;
          }

          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            // getActiveObjects() unwraps a multi-select ActiveSelection; removing
            // the wrapper itself would leave its children on the canvas.
            c.getActiveObjects().forEach((o: any) => c.remove(o));
            c.discardActiveObject();
            c.requestRenderAll();
            schedulePush();
            setOverlay(null);
            if (typeof props.onSelectionChange === 'function') props.onSelectionChange(null);
            return;
          }

          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            active.set('left', (active.left ?? 0) - step);
            active.setCoords?.();
            c.requestRenderAll();
            schedulePush();
            updateOverlayFromActive();
            if (typeof props.onSelectionChange === 'function') {
              props.onSelectionChange(active.toObject([...SELECTION_PROPS]));
            }
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            active.set('left', (active.left ?? 0) + step);
            active.setCoords?.();
            c.requestRenderAll();
            schedulePush();
            updateOverlayFromActive();
            if (typeof props.onSelectionChange === 'function') {
              props.onSelectionChange(active.toObject([...SELECTION_PROPS]));
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            active.set('top', (active.top ?? 0) - step);
            active.setCoords?.();
            c.requestRenderAll();
            schedulePush();
            updateOverlayFromActive();
            if (typeof props.onSelectionChange === 'function') {
              props.onSelectionChange(active.toObject([...SELECTION_PROPS]));
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            active.set('top', (active.top ?? 0) + step);
            active.setCoords?.();
            c.requestRenderAll();
            schedulePush();
            updateOverlayFromActive();
            if (typeof props.onSelectionChange === 'function') {
              props.onSelectionChange(active.toObject([...SELECTION_PROPS]));
            }
          }
        };
        window.addEventListener('keydown', handleKeyDown);
        cleanupKeyboard = () => window.removeEventListener('keydown', handleKeyDown);

        const handleWheel = (e: WheelEvent) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          const delta = e.deltaY > 0 ? -EDITOR_ZOOM_STEP : EDITOR_ZOOM_STEP;
          applyZoomRef.current(zoomRef.current + delta);
        };
        window.addEventListener('wheel', handleWheel, { passive: false });
        cleanupWheel = () => window.removeEventListener('wheel', handleWheel);

        if (mounted) setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load fabric:", err);
      }
    }

    init();

    return () => {
      mounted = false;
      if (countdownIntervalRef.current !== null) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (pendingPushRef.current != null) {
        clearTimeout(pendingPushRef.current);
        pendingPushRef.current = null;
      }
      if (previewRafRef.current != null) {
        cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      previewRestoreRef.current = null;
      gifOverlayRef.current?.dispose();
      gifOverlayRef.current = null;
      const c = fabricRef.current;
      if (c) {
        c.off();
        c.dispose();
        fabricRef.current = null;
      } else if (elAtMount && (elAtMount as any).__fabric) {
        // Async init resolved after unmount and attached a canvas — tear it down.
        try { (elAtMount as any).__fabric.dispose(); } catch {}
      }
      fabricModuleRef.current = null;
      // cleanup resize listener + observer if init() got far enough to attach them
      cleanupResize?.();
      cleanupResize = null;
      cleanupKeyboard?.();
      cleanupKeyboard = null;
      cleanupWheel?.();
      cleanupWheel = null;
      cleanupPrePress?.();
      cleanupPrePress = null;
    };
  }, []);


  // Back-compat wrapper — every explicit call site in this file now routes through the
  // debounced scheduler, so programmatic edits (addShape, updateActiveObject, etc.) behave
  // identically to event-driven ones and never duplicate history entries.
  function pushSnapshot() { schedulePush(); }

  function undo() {
    // Commit any in-flight edit first so undo always steps back from the latest state.
    flushPending();
    const h = getPageHistory(currentPageRef.current);
    if (h.undo.length < 2) return; // need previous + current
    const current = h.undo.pop()!;
    h.redo.push(current);
    const previous = h.undo[h.undo.length - 1];
    replaceCanvasContent(previous);
  }

  function redo() {
    const h = getPageHistory(currentPageRef.current);
    if (h.redo.length === 0) return;
    const next = h.redo.pop()!;
    h.undo.push(next);
    replaceCanvasContent(next);
  }

  function canUndo() { return getPageHistory(currentPageRef.current).undo.length >= 2; }
  function canRedo() { return getPageHistory(currentPageRef.current).redo.length > 0; }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;
      if (isEditable) return;

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
//persist data start
  const persistProject = (updatedPages: any[]) => {
    localStorage.setItem(
      "viup_project",
      JSON.stringify({
        pages: updatedPages,
        currentPage,
        musicUrl,
      })
    );
  };
//persist data end
  const addText = useCallback((text = "New text", opts: Record<string, any> = {}) => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;

    // When no explicit position is supplied (e.g. clicking "Text" in the
    // sidebar) drop the textbox in the centre of the current viewport. Callers
    // that pass left/top — like drag-and-drop — keep the top-left origin.
    const hasPos = opts.left !== undefined || opts.top !== undefined;
    let centerProps: Record<string, any> = { left: 80, top: 80 };
    if (!hasPos) {
      const center =
        typeof (canvas as any).getVpCenter === 'function'
          ? (canvas as any).getVpCenter()
          : { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 };
      centerProps = { left: center.x, top: center.y, originX: 'center', originY: 'center' };
    }

    const props = { ...centerProps, fontSize: 36, fill: "#111827", ...opts };
    const textObj = new fabric.Textbox(text, props);

    canvas.add(textObj);
    canvas.setActiveObject(textObj);
    canvas.requestRenderAll();
    pushSnapshot();
    updateOverlayFromActive();
    // 🔥 THIS IS THE FIX
  saveCurrentPage();
  }, []);

  const enterTextTool = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // The two draw tools are mutually exclusive — cancel any in-progress line.
    lineToolRef.current = false;
    lineToolStartRef.current = null;
    if (lineDraftRef.current) {
      canvas.remove(lineDraftRef.current);
      lineDraftRef.current = null;
    }
    textToolRef.current = true;
    textToolStartRef.current = null;
    textToolDraggedRef.current = false;
    canvas.defaultCursor = 'text';
    canvas.hoverCursor = 'text';
    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, []);

  const exitTextTool = useCallback(() => {
    const canvas = fabricRef.current;
    textToolRef.current = false;
    textToolStartRef.current = null;
    textToolDraggedRef.current = false;
    if (!canvas) return;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.requestRenderAll();
  }, []);

  // Line tool — same enter/exit pattern as the text tool (crosshair cursor,
  // marquee selection off so the press-drag draws instead of rubber-banding).
  const exitLineTool = useCallback(() => {
    const canvas = fabricRef.current;
    lineToolRef.current = false;
    lineToolStartRef.current = null;
    // A draft still on the canvas means the tool was cancelled mid-drag.
    if (canvas && lineDraftRef.current) canvas.remove(lineDraftRef.current);
    lineDraftRef.current = null;
    if (!canvas) return;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.requestRenderAll();
  }, []);

  const enterLineTool = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // The two draw tools are mutually exclusive.
    textToolRef.current = false;
    textToolStartRef.current = null;
    textToolDraggedRef.current = false;
    lineToolRef.current = true;
    lineToolStartRef.current = null;
    lineDraftRef.current = null;
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { }
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onDropHandler = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;

    // handle file drops first
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      downscaleImageFile(file).then(async (dataUrl) => {
        try {
          const img = await fabric.Image.fromURL(dataUrl, imageLoadOpts(dataUrl));
          img.set({ left: x, top: y, scaleX: 0.6, scaleY: 0.6 });
          canvas.add(img);
          canvas.requestRenderAll();
          pushSnapshot();
        } catch (err) {
          console.error('Failed to load dropped file image', err);
        }
      }).catch(reportImageFailure);
      return;
    }

    const payload = e.dataTransfer.getData('application/json');
    if (payload) {
      try {
        const data = JSON.parse(payload);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (data.type === 'shape' && data.shape) {
          addShape(data.shape);
          const active = fabricRef.current?.getActiveObject();
          if (active) { active.set({ left: x, top: y }); canvas.requestRenderAll(); pushSnapshot(); }
        } else if (data.type === 'element' && (data.element === 'countdown' || data.element === 'guestbook')) {
          addElement(data.element, { x, y });
        } else if (data.type === 'text' && data.text) {
          addText(data.text, { ...(data.opts || {}), left: x, top: y });
        } else if (data.type === 'image-url' && data.url) {
          const imgOpts = imageLoadOpts(data.url);
          fabric.Image.fromURL(data.url, imgOpts).then((img: any) => {
            img.set({ left: x, top: y, scaleX: 0.6, scaleY: 0.6 });
            canvas.add(img);
            canvas.requestRenderAll();
            pushSnapshot();
          }).catch((err: any) => console.error('Failed to load image-url', err));
        }
      } catch (err) {
        console.error('Invalid drag payload', err);
      }
    }
  }, []);

  const deleteFromOverlay = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const targets = canvas.getActiveObjects();
    if (targets.length === 0) return;
    targets.forEach((o: any) => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushSnapshot();
    setOverlay(null);
    if (typeof props.onSelectionChange === 'function') props.onSelectionChange(null);
  }, []);

  const cloneFromOverlay = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    active.clone().then((cloned: any) => {
      cloned.left += 10;
      cloned.top += 10;
      canvas.add(cloned);
      pushSnapshot();
    });
  }, []);

  const bringToFrontFromOverlay = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    const objs = c.getObjects();
    (c as any).moveObjectTo(a, objs.length - 1);
    c.requestRenderAll();
    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
    updateOverlayFromActive();
  }, [updateOverlayFromActive]);

  const sendToBackFromOverlay = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    (c as any).moveObjectTo(a, 0);
    c.requestRenderAll();
    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
    updateOverlayFromActive();
  }, [updateOverlayFromActive]);

  // One-step stacking moves for the selection toolbar.
  const bringForwardFromOverlay = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    const objs = c.getObjects();
    const idx = objs.indexOf(a);
    if (idx >= objs.length - 1) return; // already top-most
    (c as any).moveObjectTo(a, idx + 1);
    c.requestRenderAll();
    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
    updateOverlayFromActive();
  }, [updateOverlayFromActive]);

  const sendBackwardFromOverlay = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    const objs = c.getObjects();
    const idx = objs.indexOf(a);
    // Don't drop behind a pinned border (lowest non-border slot is the floor).
    const floor = Math.max(0, objs.findIndex((o: any) => !(o as any).isBorder));
    if (idx <= floor) return;
    (c as any).moveObjectTo(a, idx - 1);
    c.requestRenderAll();
    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
    updateOverlayFromActive();
  }, [updateOverlayFromActive]);

  const setActiveFont = useCallback((font: string) => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    a.set({ fontFamily: font });
    c.requestRenderAll();
    setOverlay((prev) => (prev ? { ...prev, fontFamily: font } : prev));
    // Re-measure/repaint once the webfont is actually ready (Fabric otherwise
    // lays the text out against the fallback face).
    loadGoogleFont(font).then(() => {
      const obj = c.getActiveObject();
      if (obj && (obj as any).fontFamily === font) {
        (obj as any).initDimensions?.();
        obj.setCoords?.();
        c.requestRenderAll();
        updateOverlayFromActive();
      }
    });
    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
  }, [updateOverlayFromActive]);

  // Close the inline font menu whenever the selection is gone or non-text.
  useEffect(() => {
    if (!overlay || !overlay.isText) setFontMenuOpen(false);
  }, [overlay]);

  // Close the Arrange menu whenever the selection is cleared.
  useEffect(() => {
    if (!overlay) setArrangeMenuOpen(false);
  }, [overlay]);

  // Dismiss the font menu on any outside click (its own clicks stopPropagation).
  useEffect(() => {
    if (!fontMenuOpen) return;
    const onDown = () => setFontMenuOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [fontMenuOpen]);

  // Dismiss the Arrange menu on any outside click.
  useEffect(() => {
    if (!arrangeMenuOpen) return;
    const onDown = () => setArrangeMenuOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [arrangeMenuOpen]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Resolve the right-click selection and report what group actions apply.
  // Preserves an existing multi-selection when the click lands inside it (so the
  // "Group" action stays available); otherwise makes `target` the active object.
  // Returns: canGroup (an ActiveSelection of ≥2 unlocked, non-border objects) and
  // isGroup (the resolved selection is a Fabric group → can be ungrouped).
  const computeGroupFlags = useCallback((target: any): { canGroup: boolean; isGroup: boolean } => {
    const canvas = fabricRef.current;
    if (!canvas || !target) return { canGroup: false, isGroup: false };
    const active = canvas.getActiveObject() as any;
    const inMulti =
      active?.type === 'activeselection' &&
      (active === target || !!active.getObjects?.().includes(target));
    if (!inMulti && canvas.getActiveObject() !== target && typeof target.onSelect === 'function') {
      try { canvas.setActiveObject(target); } catch { /* still show the menu */ }
    }
    const sel = canvas.getActiveObject() as any;
    const canGroup =
      sel?.type === 'activeselection' &&
      (sel.getObjects?.().length ?? 0) >= 2 &&
      sel.getObjects().every((o: any) => !o.locked && !o.isBorder);
    return { canGroup: !!canGroup, isGroup: sel?.type === 'group' };
  }, []);

  // Native right-click handler on the canvas wrap. Fabric 7's `fireRightClick`
  // mouse:down event is unreliable, so we resolve the target ourselves via
  // findTarget (falling back to the current selection) and open our menu.
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    e.preventDefault();

    const objects = canvas.getObjects();
    const active = canvas.getActiveObject() as any;
    // Resolve what was right-clicked. Fabric v7's findTarget returns an INFO
    // object ({ target, subTargets, ... }), so read `.target` — not the return
    // value itself (the old `objects.includes(found)` check never matched).
    let hit: any = null;
    try { hit = (canvas as any).findTarget?.(e.nativeEvent)?.target ?? null; } catch { hit = null; }

    let target: any = null;
    // Right-clicking inside an active multi-selection keeps the whole selection
    // (so we can offer "Group") instead of collapsing it to one object. The
    // ActiveSelection isn't in canvas.getObjects(), so detect the hit via its
    // own bounds / membership rather than the objects array.
    if (active?.type === 'activeselection') {
      let inside = false;
      try { inside = !!active.containsPoint?.(canvas.getScenePoint(e.nativeEvent)); } catch { inside = false; }
      if (inside || hit === active || (hit && active.getObjects?.().includes(hit))) {
        target = active;
      }
    }
    if (!target) {
      if (hit && objects.includes(hit)) target = hit;
      if (!target && active && objects.includes(active)) target = active;
    }
    if (!target) {
      setContextMenu(null);
      return;
    }

    const flags = computeGroupFlags(target);
    canvas.requestRenderAll();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hidden: target.visible === false,
      isImage: target.type === 'image',
      ...flags,
    });
  }, [computeGroupFlags]);

  // ── Group / Ungroup ───────────────────────────────────────────────────────
  // Operate purely on the active page's canvas objects (the canvas only ever
  // holds the current page), so grouping never spans pages. Built on Fabric's
  // native Group, which preserves each child's position/size/rotation/styling
  // and order, serializes into the same page JSON, and rides the existing
  // undo/redo (pushSnapshot) + autosave (saveCurrentPage) paths.
  const doGroup = useCallback(() => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) { setContextMenu(null); return; }
    const sel = canvas.getActiveObject() as any;
    if (!sel || sel.type !== 'activeselection') { setContextMenu(null); return; }

    // Order members by their canvas stacking index so the group keeps the exact
    // visual z-order; never absorb locked objects or pinned borders.
    const all = canvas.getObjects();
    const members: any[] = sel
      .getObjects()
      .filter((o: any) => !o.locked && !o.isBorder)
      .sort((a: any, b: any) => all.indexOf(a) - all.indexOf(b));
    if (members.length < 2) { setContextMenu(null); return; }

    // Target stack slot: just above every surviving object that sat below the
    // top-most selected one — keeps the group where the selection was.
    const memberSet = new Set(members);
    const topIndex = Math.max(...members.map((o) => all.indexOf(o)));
    const belowSurvivors = all.filter((o, i) => i < topIndex && !memberSet.has(o)).length;

    // Discard the selection first so each child is restored to absolute (scene)
    // coordinates, then build the group from those scene-positioned objects
    // (Fabric converts them to group-relative coords + computes the bbox).
    canvas.discardActiveObject();
    canvas.remove(...members);
    const group = new fabric.Group(members);
    if (!group.id) group.id = genLayerId();
    canvas.add(group);
    (canvas as any).moveObjectTo?.(group, belowSurvivors);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
    onLayersChangeRef.current?.();
    updateOverlayFromActive();
    if (typeof props.onSelectionChange === 'function') {
      props.onSelectionChange(group.toObject([...SELECTION_PROPS]));
    }
    setContextMenu(null);
  }, [updateOverlayFromActive]);

  const doUngroup = useCallback(() => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) { setContextMenu(null); return; }
    const group = canvas.getActiveObject() as any;
    if (!group || group.type !== 'group') { setContextMenu(null); return; }

    const groupIndex = canvas.getObjects().indexOf(group);
    // removeAll() detaches the children and restores each to absolute (scene)
    // coordinates, so they stay visually in place after the group is gone.
    const children: any[] = group.removeAll();
    canvas.remove(group);

    // Re-insert the children at the group's old stack slot, preserving order.
    children.forEach((o, i) => {
      if (!o.id) o.id = genLayerId();
      canvas.add(o);
      (canvas as any).moveObjectTo?.(o, groupIndex + i);
    });

    // Reselect the freed objects (multi-select if supported) so the user can
    // keep working with / regroup them, matching the editor's selection model.
    canvas.discardActiveObject();
    if (children.length > 1) {
      const selection = new fabric.ActiveSelection(children, { canvas });
      canvas.setActiveObject(selection);
    } else if (children.length === 1) {
      canvas.setActiveObject(children[0]);
    }
    canvas.requestRenderAll();

    pushSnapshot();
    saveCurrentPage(currentPageRef.current);
    onLayersChangeRef.current?.();
    updateOverlayFromActive();
    if (typeof props.onSelectionChange === 'function') {
      const a = canvas.getActiveObject();
      props.onSelectionChange(a ? a.toObject([...SELECTION_PROPS]) : null);
    }
    setContextMenu(null);
  }, [updateOverlayFromActive]);

  const ctxCopy = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    a.clone().then((cl: any) => { clipboardRef.current = cl; });
    setContextMenu(null);
  }, []);

  const ctxPaste = useCallback(() => {
    const c = fabricRef.current;
    const cb = clipboardRef.current;
    if (!c || !cb) return;
    cb.clone().then((cloned: any) => {
      cloned.left = (cloned.left ?? 0) + 10;
      cloned.top = (cloned.top ?? 0) + 10;
      c.add(cloned);
      c.setActiveObject(cloned);
      c.requestRenderAll();
      pushSnapshot();
    });
    setContextMenu(null);
  }, []);

  const ctxDelete = useCallback(() => {
    deleteFromOverlay();
    setContextMenu(null);
  }, [deleteFromOverlay]);

  const ctxBringFront = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    const objs = c.getObjects();
    (c as any).moveObjectTo(a, objs.length - 1);
    c.requestRenderAll();
    pushSnapshot();
    setContextMenu(null);
  }, []);

  const ctxSendBack = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    (c as any).moveObjectTo(a, 0);
    c.requestRenderAll();
    pushSnapshot();
    setContextMenu(null);
  }, []);

  const ctxToggleVisible = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const a = c.getActiveObject();
    if (!a) return;
    a.visible = !a.visible;
    c.requestRenderAll();
    pushSnapshot();
    setContextMenu(null);
  }, []);

  // Replace `obj`'s pixels with a new image built from `dataUrl`, preserving its
  // position, footprint (displayed width/height), rotation, flips, z-index, and
  // exported metadata. Used by both the editor's Apply and "Replace image".
  const replaceObjectImage = useCallback((obj: any, dataUrl: string) => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric || !obj || !dataUrl) return;

    console.log("[replaceObjectImage] starting, dataUrl length:", dataUrl.length, "isDataUrl:", dataUrl.startsWith('data:'));

    const idx = canvas.getObjects().indexOf(obj);
    const oldW = typeof obj.getScaledWidth === 'function' ? obj.getScaledWidth() : (obj.width ?? 0) * (obj.scaleX ?? 1);
    const oldH = typeof obj.getScaledHeight === 'function' ? obj.getScaledHeight() : (obj.height ?? 0) * (obj.scaleY ?? 1);

    // If dataUrl is a data: URL (from editor), upload it first. Otherwise it's already a URL.
    const imageUrlPromise = dataUrl.startsWith('data:')
      ? uploadEditedImage(dataUrl)
      : Promise.resolve(dataUrl);

    imageUrlPromise
      .then((imageUrl) => {
        console.log("[replaceObjectImage] using image URL:", imageUrl.substring(0, 50) + "...");
        return fabric.Image.fromURL(imageUrl, imageLoadOpts(imageUrl)).then((img: any) => ({ img, imageUrl }));
      })
      .then(({ img, imageUrl }) => {
        const nW = img.width || 1;
        const nH = img.height || 1;
        console.log("[replaceObjectImage] loaded new image, dimensions:", nW, "x", nH);

        img.set({
          left: obj.left,
          top: obj.top,
          angle: obj.angle ?? 0,
          originX: obj.originX ?? 'left',
          originY: obj.originY ?? 'top',
          flipX: obj.flipX ?? false,
          flipY: obj.flipY ?? false,
          skewX: obj.skewX ?? 0,
          skewY: obj.skewY ?? 0,
          scaleX: oldW > 0 ? oldW / nW : (obj.scaleX ?? 1),
          scaleY: oldH > 0 ? oldH / nH : (obj.scaleY ?? 1),
        });
        // Preserve exported metadata (action, animation, id, name, etc.) and src for image retrieval.
        FABRIC_EXPORT_PROPS.forEach((p) => {
          if ((obj as any)[p] !== undefined) (img as any)[p] = (obj as any)[p];
        });
        // Store the uploaded URL (or provided URL) as src. This is now much smaller than a base64 string
        // and won't hit upload size limits. The URL points to the persistent blob storage.
        (img as any).src = imageUrl;
        console.log("[replaceObjectImage] set src to URL:", imageUrl.substring(0, 50) + "...");

        canvas.remove(obj);
        canvas.add(img);
        if (idx >= 0) (canvas as any).moveObjectTo?.(img, idx);
        canvas.setActiveObject(img);

        canvas.requestRenderAll();
        pushSnapshot();
        saveCurrentPage(currentPageRef.current);
        editingImageRef.current = null;
        console.log("[replaceObjectImage] complete");
      })
      .catch((err: any) => {
        console.error('[replaceObjectImage] Failed to replace image', err);
        showPackageToast(
          "Failed to apply image edits — please try again. " + (err?.message ?? ""),
          "error",
        );
        editingImageRef.current = null;
      });
  }, []);

  // Open the external editor modal for the active image (or a right-clicked one).
  const requestEditActiveImage = useCallback((crop = false) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || (obj as any).type !== 'image') return;
    editingImageRef.current = obj;
    const src = (obj as any).getSrc?.() ?? (obj as any)._element?.src;
    if (!src) return;
    setContextMenu(null);
    onEditImageRef.current?.(src, { crop });
  }, []);

  const ctxReplaceImage = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj || (obj as any).type !== 'image') return;
    editingImageRef.current = obj;
    setContextMenu(null);
    replaceInputRef.current?.click();
  }, []);

  const handleReplaceFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.currentTarget;
    if (!file) return;
    downscaleImageFile(file).then((dataUrl) => {
      const obj = editingImageRef.current ?? fabricRef.current?.getActiveObject();
      replaceObjectImage(obj, dataUrl);
      input.value = '';
    }).catch(reportImageFailure);
  }, [replaceObjectImage]);

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const triggerMusicUpload = useCallback(() => {
    musicInputRef.current?.click();
  }, []);

  const handleImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!file || !canvas || !fabric) return;

    downscaleImageFile(file).then(async (dataUrl) => {
      try {
        const img = await fabric.Image.fromURL(dataUrl, imageLoadOpts(dataUrl));
        img.set({ left: 100, top: 100, scaleX: 0.6, scaleY: 0.6 });
        canvas.add(img);
        canvas.requestRenderAll();
        pushSnapshot();
      } catch (err) {
        console.error('Failed to load uploaded image', err);
      }
    }).catch(reportImageFailure);
    // reset input so same file can be reselected
    e.currentTarget.value = "";
  }, []);

  const handleMusic = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const input = e.currentTarget;

    // Reject obvious non-audio / oversized picks here rather than letting the
    // blob token reject them, so the user gets a readable reason. MP3s pass:
    // audio/mpeg (and a blank type with a .mp3 name) are both accepted.
    const invalid = validateAudioFile(file);
    if (invalid) {
      showPackageToast(invalid, "error");
      input.value = "";
      return;
    }

    // Mark the upload in flight so Preview/Save can wait for it (see
    // isMusicUploading). Toast up-front so the user knows a full-length song is
    // still transferring even though the file dialog has closed.
    musicUploadingRef.current = true;
    showPackageToast("Preparing music…", "warn");
    try {
      // Re-encode oversized tracks down to a background-music bitrate before
      // they leave the browser — smaller blob, faster invite load. The helper
      // is dynamically imported (the MP3 encoder never touches the Canvas'
      // initial bundle) and returns the ORIGINAL file untouched whenever
      // optimization is skipped or fails, so uploads stay as reliable as before.
      const result = await optimizeAudioFile(file);
      const toUpload = result.file;

      showPackageToast(
        result.optimized
          ? `Uploading music… ${formatBytes(result.originalBytes)} → ${formatBytes(result.outputBytes)}`
          : "Uploading music…",
        "warn",
      );

      // Stream straight to blob storage (no 4.5MB serverless body limit), so
      // full-length songs upload as reliably as short clips.
      const safeName =
        (toUpload.name || "music")
          .toLowerCase()
          .replace(/[^a-z0-9.]+/g, "-")
          .replace(/^-+|-+$/g, "") || "music";
      const blob = await upload(`music/${Date.now()}-${safeName}`, toUpload, {
        access: "public",
        contentType: toUpload.type || "audio/mpeg",
        handleUploadUrl: "/api/upload-music",
      });
      setMusicUrl(blob.url);
      setMusicPlaying(true);
      // Upload succeeded — count it (a cancelled file dialog never reaches here).
      props.onMusicChange?.(blob.url);
      showPackageToast(
        result.optimized
          ? `Music uploaded (${formatBytes(result.originalBytes)} → ${formatBytes(result.outputBytes)}) — it's ready to save.`
          : "Music uploaded — it's ready to save.",
        "success",
      );
    } catch (err: any) {
      console.error("Music upload failed", err);
      showPackageToast(
        "Music upload failed — please try again. " + (err?.message ?? ""),
        "error",
      );
    } finally {
      musicUploadingRef.current = false;
      input.value = "";
    }
  }, [props.onMusicChange]);

  const addImageFromUrl = useCallback((url: string) => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric || !url) return;

    const imgOpts = imageLoadOpts(url);
    fabric.Image.fromURL(url, imgOpts).then((img: any) => {
      img.set({ left: 100, top: 100, scaleX: 0.6, scaleY: 0.6 });
      canvas.add(img);
      canvas.requestRenderAll();
      pushSnapshot();
    }).catch((err: any) => console.error('Failed to load image from url', err));
  }, []);

  const addMusicFromUrl = useCallback((url: string) => {
    if (!url) return;
    setMusicUrl(url);
    setMusicPlaying(true);
    // Real, user-initiated change — let the parent count it toward the limit.
    props.onMusicChange?.(url);
    console.log("Music added:", url);
  }, [props.onMusicChange]);

  const addBorder = useCallback((url: string) => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric || !url) return;

    // Only one border at a time — remove any existing border objects from the canvas
    // and replace the global border list so the new one is the only one that
    // follows across pages and into the RSVP export.
    canvas.getObjects().forEach((o: any) => {
      if (o?.isBorder) canvas.remove(o);
    });

    const id = `border_${Date.now()}`;
    globalBordersRef.current = [{ url, id }];

    const w = (canvas.width as number) ?? 396;
    const h = (canvas.height as number) ?? 704;
    const imgOpts = imageLoadOpts(url);
    fabric.Image.fromURL(url, imgOpts).then((img: any) => {
      const el = img.getElement?.() as HTMLImageElement | null;
      const natW = (el?.naturalWidth ?? 0) > 0 ? el!.naturalWidth : (img.width || 1);
      const natH = (el?.naturalHeight ?? 0) > 0 ? el!.naturalHeight : (img.height || 1);
      img.set({
        left: 0, top: 0,
        originX: 'left', originY: 'top',
        scaleX: w / natW,
        scaleY: h / natH,
        selectable: false, evented: false,
        isBorder: true, borderId: id,
        name: '__border__',
      });
      canvas.add(img);
      (canvas as any).moveObjectTo(img, 0);
      canvas.requestRenderAll();
    }).catch((err: any) => console.error('Failed to load border', err));
  }, []);

  const exportPNG = useCallback(() => {
    
    const canvas = fabricRef.current;
    if (!canvas) return;
    // GIFs animate in a DOM layer the canvas can't see — put them back for the
    // capture so the PNG carries their first frame instead of a gap.
    const dataUrl = withGifsOnCanvas(() =>
      canvas.toDataURL({ multiplier: 1, format: "png", quality: 0.92 }),
    );
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "wedding-design.png";
    a.click();
  }, []);

 const exportHTML = useCallback(async (eventName?: string): Promise<string> => {
  const canvas = fabricRef.current;
  const fabric = fabricModuleRef.current;
  if (!canvas || !fabric) throw new Error("The canvas is not ready yet.");

  const currentPageJson = serializeCanvas(canvas);
  const exportedPages = pages.map((page, index) => {
    if (index === currentPage) return currentPageJson;
    return page ?? null;
  });

  // Shape the published payload on the CLIENT (was done in the route handler)
  // so the whole design — including base64 photos and per-page backgrounds —
  // can stream straight to blob storage. Routing it through the serverless
  // function instead hit Vercel's 4.5MB request-body limit and silently
  // dropped large publishes, freezing /e/{slug} at the last small version.
  //
  // The slug is the EVENT ID, never the title: publishing the same event twice
  // overwrites one stable blob, so a shared link survives renames and two events
  // with identical titles can never overwrite each other. A canvas with no event
  // (legacy project / teaser) has nowhere safe to publish and must not fall back
  // to a shared path — surface that instead of silently writing somewhere else.
  const slug = eventSlug(props.eventId);
  if (!slug) {
    throw new Error(
      "This canvas is not linked to an event yet, so it cannot be published. Open it from My Event and try again.",
    );
  }
  const env = extractEnvelope(exportedPages ?? []);
  const borderList = globalBordersRef.current ?? [];
  const borderUrl = borderList.length > 0 ? borderList[0].url : null;

  const payload = {
    eventName: eventName ?? "",
    pages: env.remainingPages,
    envelope: env.hasEnvelope
      ? {
          headSrc: env.headSrc,
          sealSrc: env.sealSrc,
          bodySrc: env.bodySrc,
          logoSrc: env.logoSrc,
          bgColor: env.bgColor,
          titleText: env.titleText,
          subtitleText: env.subtitleText,
          pressText: env.pressText,
          headPos: env.headPos,
          sealPos: env.sealPos,
          bodyPos: env.bodyPos,
          logoPos: env.logoPos,
          titlePos: env.titlePos,
          subtitlePos: env.subtitlePos,
          pressPos: env.pressPos,
          titleStyle: env.titleStyle,
          subtitleStyle: env.subtitleStyle,
          pressStyle: env.pressStyle,
          extras: env.extras,
        }
      : null,
    musicUrl: musicUrl ?? null,
    borderUrl,
    contacts: props.contacts ?? [],
    moneyGift: props.moneyGift ?? null,
    calendar: props.calendar ?? null,
    location: props.location ?? null,
    // Unlike the four above, rsvpConfig is NOT threaded down as a prop — the RSVP
    // sidebar writes it straight into the shared store. Reading only props here
    // published `null` every time, so max guests, the nav colors, the RSVP toggle
    // and Guest Category never reached /e/{slug}; the defaults happened to match
    // the sidebar defaults, which is why it went unnoticed. Store first, prop as
    // the fallback for surfaces that render outside a provider.
    rsvpConfig: eventCtx?.eventData.rsvpConfig ?? props.rsvpConfig ?? null,
    userId: props.userId ?? null,
    eventId: props.eventId ?? null,
    packageId: props.packageId ?? null,
    // Published invitations play back in the mode chosen in Artboard. Blobs
    // written before this existed simply lack the key and stay page mode.
    presentationMode: presentationModeRef.current,
  };

  try {
    // Direct browser → blob upload; /api/export-to-rsvp only signs the token,
    // so there is no function-body size ceiling on the design itself.
    await upload(eventBlobPath(slug), JSON.stringify(payload), {
      access: "public",
      contentType: "application/json",
      handleUploadUrl: "/api/export-to-rsvp",
    });
    return slug;
  } catch (err: any) {
    // Rethrow instead of returning a fallback slug: the caller must know the
    // publish failed so it can report it and (for Share Link) skip the iFastNet
    // sync entirely. The old behaviour returned "rsvp", which handed the user a
    // link to an unrelated blob as if publishing had worked.
    console.error("export-to-rsvp upload error:", err);
    throw new Error(err?.message ? `Publish failed: ${err.message}` : "Publish failed.");
  }
}, [currentPage, musicUrl, pages, serializeCanvas, props, eventCtx]);

  // Render every page to a PNG on an offscreen StaticCanvas and assemble them
  // into a single PDF (one page per canvas page), named after the event.
  const exportPDF = useCallback(async (eventName?: string): Promise<void> => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;

    const currentPageJson = serializeCanvas(canvas);
    const exportedPages = pages.map((page, index) =>
      index === currentPage ? currentPageJson : (page ?? null)
    );

    // Pages the user hasn't visited this session may reference fonts that were
    // never loaded; wait for them so offscreen text renders with the real face.
    const families = collectFontFamilies(exportedPages);
    if (families.length) await preloadFonts(families);

    const { jsPDF } = await import("jspdf");
    const w = CANVAS_REF_WIDTH;
    const h = CANVAS_REF_HEIGHT;
    const orientation = h >= w ? "portrait" : "landscape";
    const pdf = new jsPDF({ orientation, unit: "px", format: [w, h] });

    const el = document.createElement("canvas");
    const offscreen = new (fabric as any).StaticCanvas(el, { width: w, height: h });
    try {
      for (let i = 0; i < exportedPages.length; i++) {
        offscreen.clear();
        offscreen.backgroundColor = "#ffffff";
        const json = exportedPages[i];
        if (json) {
          const result = offscreen.loadFromJSON(json);
          if (result && typeof result.then === "function") await result;
        }
        offscreen.renderAll();
        // multiplier 2 keeps text crisp when the PDF page is viewed at full size.
        const dataUrl = offscreen.toDataURL({ format: "png", multiplier: 2 });
        if (i > 0) pdf.addPage([w, h], orientation);
        pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
      }
    } finally {
      offscreen.dispose();
    }

    const fileName = (eventName ?? "").trim() || "wedding-invitation";
    pdf.save(`${fileName}.pdf`);
  }, [currentPage, pages, serializeCanvas]);

  const saveLocal = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
  
    // 🔥 save current page first
    const updatedPages = [...pages];
    updatedPages[currentPage] = serializeCanvas(canvas);
  
    const data = {
      pages: updatedPages,
      currentPage,
      musicUrl
    };
  
    localStorage.setItem("viup_project", JSON.stringify(data));
  
    alert("Saved to localStorage");
  }, [pages, currentPage, musicUrl, serializeCanvas]);

  const loadLocal = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const raw = localStorage.getItem("viup_project");
    if (!raw) return alert("No saved project found");
    try {
      const data = JSON.parse(raw);
      setPages(data.pages || [null]);
      const index = data.currentPage || 0;
      currentPageRef.current = index;
      setCurrentPage(index);
      const pageData = data.pages?.[index] ?? null;
      // A load is a hard reset — previous per-page history no longer matches the new pages.
      historiesRef.current.clear();
      replaceCanvasContent(pageData, () => { commitSnapshot(); });
      if (data.musicUrl) setMusicUrl(data.musicUrl);
    } catch (e) {
      console.error(e);
      alert("Failed to load project");
    }
  }, [replaceCanvasContent, commitSnapshot]);
//Pages function start
const saveCurrentPage = (index: number = currentPageRef.current) => {
  const canvas = fabricRef.current;
  if (!canvas) return;

  setPages(prev => {
    const updated = [...prev];
    updated[index] = serializeCanvas(canvas);
    return updated;
  });
};

// Patch the stored background of every page EXCEPT the active one (saveCurrentPage
// already covers that). Keeps the whole invitation sharing a single background.
// `undefined` values clear the corresponding property.
const applyBgToOtherPages = (patch: { backgroundImage?: any; backgroundColor?: any }) => {
  setPages(prev =>
    prev.map((p, i) => {
      if (i === currentPageRef.current) return p;
      // Blank pages (null) become a minimal page so they show the bg too.
      const page = p ?? { objects: [] };
      return { ...page, ...patch };
    })
  );
};

  const loadPage = (index: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    currentPageRef.current = index;
    const pageData = pages[index] ?? null;
    replaceCanvasContent(pageData, () => {
      // Seed the target page's history if it hasn't been touched yet.
      const h = getPageHistory(index);
      if (h.undo.length === 0) commitSnapshot();
    });
  };
  const goToPage = (index: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (index < 0 || index >= pages.length) return;
    if (index === currentPage) return;
    // Capture any in-flight edit on the outgoing page so its history reflects the latest state.
    flushPending();
    const prevIndex = currentPage;
    const currentJSON = serializeCanvas(canvas);
    const nextPageData = pages[index] ?? null;
    // Flip the current-page ref before loading so event listeners attribute the seed
    // snapshot to the target page, not the outgoing one.
    currentPageRef.current = index;
    setPages(prev => {
      const updated = [...prev];
      updated[prevIndex] = currentJSON;
      return updated;
    });
    setCurrentPage(index);
    // Defer the canvas load until after React commits the state changes.
    // This mirrors the setTimeout(0) used during init and prevents the canvas
    // from appearing blank when React re-renders while loadFromJSON is in flight.
    setTimeout(() => {
      replaceCanvasContent(nextPageData, () => {
        const h = getPageHistory(index);
        if (h.undo.length === 0) commitSnapshot();
        fabricRef.current?.requestRenderAll();
      });
    }, 0);
  };
  const addPage = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    flushPending();
    const prevIndex = currentPage;
    const currentJSON = serializeCanvas(canvas);
    const newIndex = pages.length; // append semantics — new page's index equals current length
    currentPageRef.current = newIndex;
    // If a background was applied to all pages, new pages inherit it too.
    const seed = globalBgRef.current ? { objects: [], ...globalBgRef.current } : null;
    setPages(prev => {
      const updated = [...prev];
      updated[prevIndex] = currentJSON;
      updated.push(seed);
      return updated;
    });
    replaceCanvasContent(seed, () => {
      const h = getPageHistory(newIndex);
      if (h.undo.length === 0) commitSnapshot();
    });
    setCurrentPage(newIndex);
  };

  // `skipConfirm` is for callers that already confirmed in their own UI (the
  // phone ⋮ menu asks inline) — everything else gets the native prompt.
  const removePage = (opts?: { skipConfirm?: boolean }) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (pages.length <= 1) return; // keep at least one page
    // Envelope page is permanent and cannot be deleted
    if (isCurrentPageEnvelope()) {
      alert("The envelope page cannot be deleted. You can only change its color and texture.");
      return;
    }
    if (
      !opts?.skipConfirm &&
      typeof window !== 'undefined' &&
      !window.confirm(`Delete page ${currentPage + 1}? This cannot be undone.`)
    ) return;
    flushPending();
    const removedIndex = currentPage;
    const nextIndex = removedIndex === 0 ? 0 : removedIndex - 1;

    // Rekey histories: drop the removed index, shift higher indices down by 1.
    const oldHistories = historiesRef.current;
    const newHistories = new Map<number, PageHistory>();
    oldHistories.forEach((h, idx) => {
      if (idx === removedIndex) return;
      newHistories.set(idx > removedIndex ? idx - 1 : idx, h);
    });
    historiesRef.current = newHistories;

    currentPageRef.current = nextIndex;
    const newPages = pages.filter((_, i) => i !== removedIndex);
    setPages(newPages);
    setCurrentPage(nextIndex);
    const nextPageData = newPages[nextIndex] ?? null;
    setTimeout(() => {
      replaceCanvasContent(nextPageData, () => {
        const h = getPageHistory(nextIndex);
        if (h.undo.length === 0) commitSnapshot();
        fabricRef.current?.requestRenderAll();
      });
    }, 0);
  };

  // ── Envelope page detection ──────────────────────────────────────────────────
  // The envelope page is always the first page and contains structural elements like
  // "envelope-body", "envelope-head", "envelope-seal". Users cannot delete or reorder it,
  // and can only edit color/texture of the page and related styling options.
  const isEnvelopeObj = (o: any): boolean =>
    typeof o?.name === 'string' && (
      o.name === 'envelope-body' ||
      o.name === 'envelope-head' ||
      o.name === 'envelope-seal'
    );

  const isEnvelopePageData = (data: any): boolean => {
    const objs = Array.isArray(data?.objects) ? data.objects : null;
    if (!objs) return false;
    return objs.some(isEnvelopeObj);
  };

  const isEnvelopePage = (index: number): boolean => {
    return isEnvelopePageData(pages[index]);
  };

  const isCurrentPageEnvelope = (): boolean => {
    return isEnvelopePage(currentPageRef.current);
  };

  // ── Gallery page (toggle from the Photos sidebar) ──────────────────────────
  // A "gallery page" is identified structurally: the gallery template's image
  // placeholders carry names like "galleryImage1", and `name` is serialized
  // (FABRIC_EXPORT_PROPS), so detection survives edits and re-serialization.
  const isGalleryObj = (o: any): boolean =>
    typeof o?.name === 'string' && o.name.startsWith('galleryImage');

  const isGalleryPageData = (data: any): boolean => {
    const objs = Array.isArray(data?.objects) ? data.objects : null;
    if (!objs) return false;
    return objs.some(isGalleryObj);
  };

  // Standardized gallery slot: 292×443, centered at (190, 310). Every gallery
  // image (template defaults + uploads) shares this exact frame, so they all
  // overlap into one slot — the slideshow shows one at a time.
  const GALLERY_SLOT = { centerX: 190, width: 292, height: 443, firstTop: 310 };

  // How long each gallery photo stays on screen before the slideshow advances.
  const [gallerySlideMs, setGallerySlideMsState] = React.useState(5000);
  const setGallerySlideInterval = (ms: number) => {
    setGallerySlideMsState(Math.max(500, ms));
  };

  // Index of the gallery page, scanning live content for the current page so an
  // unsaved just-added gallery page is still found. Returns -1 if none.
  const findGalleryPageIndex = (): number => {
    const canvas = fabricRef.current;
    const cur = currentPageRef.current;
    return pages.findIndex((p, i) =>
      isGalleryPageData(i === cur && canvas ? serializeCanvas(canvas) : p),
    );
  };

  const hasGalleryPage = () => findGalleryPageIndex() >= 0;

  // Count the USER-added gallery photos (what the package limit applies to),
  // reading the live canvas when the gallery is the page on screen and the stored
  // page JSON otherwise. The template's free starter photos are discounted, so a
  // Standard user (limit 8) can add a full 8 of their own. 0 when no gallery
  // exists; clamped at 0 in case the user deleted the starters.
  const getGalleryCount = (): number => {
    const idx = findGalleryPageIndex();
    if (idx < 0) return 0;
    const canvas = fabricRef.current;
    const total =
      idx === currentPageRef.current && canvas
        ? canvas.getObjects().filter(isGalleryObj).length
        : (Array.isArray(pages[idx]?.objects) ? pages[idx].objects : []).filter(
            isGalleryObj,
          ).length;
    return Math.max(0, total - GALLERY_STARTER_COUNT);
  };

  // Append the gallery template as a new page and switch to it. No-op if a
  // gallery page already exists (we never add a second one). The template
  // already carries the default photos in its image slots.
  const addGalleryPage = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (hasGalleryPage()) return;
    flushPending();
    const prevIndex = currentPage;
    const currentJSON = serializeCanvas(canvas);
    const newIndex = pages.length;
    currentPageRef.current = newIndex;
    setPages(prev => {
      const updated = [...prev];
      updated[prevIndex] = currentJSON;
      updated.push(galleryPage);
      return updated;
    });
    replaceCanvasContent(galleryPage, () => {
      const h = getPageHistory(newIndex);
      if (h.undo.length === 0) commitSnapshot();
    });
    setCurrentPage(newIndex);
  };

  // Remove the gallery page if one exists; otherwise do nothing. Keeps at least
  // one page and re-keys per-page histories around the removed index.
  const removeGalleryPage = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (pages.length <= 1) return;
    flushPending();
    const removedIndex = findGalleryPageIndex();
    if (removedIndex < 0) return;

    const cur = currentPageRef.current;
    let nextIndex: number;
    if (cur === removedIndex) nextIndex = removedIndex === 0 ? 0 : removedIndex - 1;
    else if (cur > removedIndex) nextIndex = cur - 1;
    else nextIndex = cur;

    const oldHistories = historiesRef.current;
    const newHistories = new Map<number, PageHistory>();
    oldHistories.forEach((h, idx) => {
      if (idx === removedIndex) return;
      newHistories.set(idx > removedIndex ? idx - 1 : idx, h);
    });
    historiesRef.current = newHistories;

    currentPageRef.current = nextIndex;
    const newPages = pages.filter((_, i) => i !== removedIndex);
    setPages(newPages);
    setCurrentPage(nextIndex);
    const nextPageData = newPages[nextIndex] ?? null;
    setTimeout(() => {
      replaceCanvasContent(nextPageData, () => {
        const h = getPageHistory(nextIndex);
        if (h.undo.length === 0) commitSnapshot();
        fabricRef.current?.requestRenderAll();
      });
    }, 0);
  };

  // Append a photo to the gallery page as another standardized 292×443 slot in
  // the same overlapping frame, so it joins the slideshow rotation (the slot
  // shows one photo at a time). No-op if there is no gallery page. Works whether
  // the gallery is the visible page (added live) or another page (appended to
  // its stored JSON so it shows when navigated to).
  const addPhotoToGallery = (url: string) => {
    if (!url) return;
    const galleryIndex = findGalleryPageIndex();
    if (galleryIndex < 0) return;

    // Start hidden so the upload joins the back of the slideshow queue instead
    // of popping on top of the photo currently showing — the cycler reveals it
    // when its turn comes around.
    const buildSlot = (natW: number, natH: number, centerY: number, index: number) => ({
      left: GALLERY_SLOT.centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
      scaleX: GALLERY_SLOT.width / (natW || 1),
      scaleY: GALLERY_SLOT.height / (natH || 1),
      visible: false,
      name: `galleryImage${index}`,
    });

    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;

    if (galleryIndex === currentPageRef.current && canvas && fabric) {
      // Gallery is on screen — add the image to the live canvas.
      const imgOpts = imageLoadOpts(url);
      fabric.Image.fromURL(url, imgOpts)
        .then((img: any) => {
          const el = img.getElement?.() as HTMLImageElement | null;
          const natW = (el?.naturalWidth ?? 0) > 0 ? el!.naturalWidth : img.width || 1;
          const natH = (el?.naturalHeight ?? 0) > 0 ? el!.naturalHeight : img.height || 1;
          const existing = canvas.getObjects().filter(isGalleryObj);
          const slot = buildSlot(natW, natH, GALLERY_SLOT.firstTop, existing.length + 1);
          img.set(slot);
          canvas.add(img);
          canvas.requestRenderAll();
          pushSnapshot();
        })
        .catch((err: any) => console.error('Failed to add photo to gallery', err));
      return;
    }

    // Gallery is a different page — append to its stored JSON via a plain image
    // object. Load the image only to read its natural size for the scale.
    const probe = new window.Image();
    probe.onload = () => {
      const natW = probe.naturalWidth || 1;
      const natH = probe.naturalHeight || 1;
      setPages((prev) => {
        const page = prev[galleryIndex];
        const objects = Array.isArray(page?.objects) ? page.objects : [];
        const existing = objects.filter(isGalleryObj);
        const slot = buildSlot(natW, natH, GALLERY_SLOT.firstTop, existing.length + 1);
        const updated = [...prev];
        updated[galleryIndex] = { ...page, objects: [...objects, { type: 'image', src: url, ...slot }] };
        return updated;
      });
    };
    probe.onerror = () => console.error('Failed to load photo for gallery', url);
    probe.src = url;
  };

  // ── Gallery slideshow ──────────────────────────────────────────────────────
  // While the gallery page is on screen, its overlapping photos are shown one at
  // a time, advancing every gallerySlideMs milliseconds. Including gallerySlideMs
  // in the dep array means the effect restarts (with idx=0) whenever the user
  // changes the interval — guaranteeing the new value is used immediately.
  // This is visual only: toggling `visible` fires no object:* events, so it
  // never enters the undo history or triggers autosave.
  const galleryActive = isGalleryPageData(pages[currentPage]);
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!isLoaded || !canvas || !galleryActive) return;

    let idx = 0;
    const enforce = (): boolean => {
      const imgs = canvas.getObjects().filter(isGalleryObj);
      if (!imgs.length) return false;
      const active = ((idx % imgs.length) + imgs.length) % imgs.length;
      imgs.forEach((o: any, n: number) => o.set({ visible: n === active }));
      canvas.requestRenderAll();
      return true;
    };

    // The page may still be loading into the canvas — poll briefly (up to ~3s)
    // until the gallery images exist, then reveal the first one.
    let polls = 0;
    const seed = setInterval(() => {
      if (enforce() || ++polls > 30) clearInterval(seed);
    }, 100);

    const id = setInterval(() => {
      // Don't swap out from under the user while they're editing a photo.
      if (canvas.getActiveObject()) return;
      idx += 1;
      enforce();
    }, gallerySlideMs);

    return () => { clearInterval(seed); clearInterval(id); };
  }, [currentPage, isLoaded, galleryActive, gallerySlideMs]);

  //pages function end

  useEffect(() => {
    onPagesChangeRef.current?.(pages.length, currentPage);
  }, [pages.length, currentPage]);

  //template function start
  const loadTemplate = (templatePages: any[]) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Normalize incoming template structure into valid Fabric pages
// Handles cases like:
// 1. pages = [{ version, objects }] ✅
// 2. pages = [{ pages: [{ version, objects }] }] ❌ nested
// 3. pages = [null / invalid] ❌
//
// Goal: always return flat array of Fabric JSON pages

    const normalizedPages = templatePages.flatMap((page) => {
      if (!page) return [];
      if (Array.isArray(page.pages)) return page.pages;
      if (Array.isArray(page.objects)) return [page];
      return [];
    });

    // If no valid pages found, clear canvas to avoid broken state
// Prevents silent failures from bad template data
    if (!normalizedPages.length) {
      console.warn("Template did not contain any Fabric page JSON", templatePages);
      replaceCanvasContent(null);
      return;
    }

    setPages(normalizedPages);
    currentPageRef.current = 0;
    setCurrentPage(0);
    // Loading a template replaces all pages — drop previous per-page histories.
    historiesRef.current.clear();

    replaceCanvasContent(normalizedPages[0], () => {
      startCountdown(canvas);
      setTimeout(() => canvas.requestRenderAll(), 50);
      commitSnapshot();
    });
  };

  // Countdown updater
  // Parse the saved calendar date ("YYYY-MM-DD" from the date input, or any
  // ISO string) into a Date. Bare dates are treated as local midnight.
  const resolveCountdownTarget = (raw: string | null): Date | null => {
    if (!raw) return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T00:00:00`)
      : new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const startCountdown = (canvas: FabricCanvas) => {
    // Refresh the target from the current calendar date and clear any prior
    // interval so we never stack multiple tickers.
    countdownTargetRef.current = resolveCountdownTarget(calendarDateRef.current);
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    const tick = () => {
      const target = countdownTargetRef.current;
      let days = 0, hours = 0, minutes = 0, seconds = 0;

      if (target) {
        const diff = target.getTime() - Date.now();
        if (diff > 0) {
          days = Math.floor(diff / (1000 * 60 * 60 * 24));
          hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          minutes = Math.floor((diff / (1000 * 60)) % 60);
          seconds = Math.floor((diff / 1000) % 60);
        }
      }

      const byUnit: Record<string, number> = { day: days, hour: hours, minute: minutes, second: seconds };

      let touched = false;
      canvas.getObjects().forEach((obj: any) => {
        if (obj.type !== "textbox") return;
        const unit: string | undefined = obj.countdownUnit;
        if (!unit || !(unit in byUnit)) return;
        const next = String(byUnit[unit]).padStart(2, "0");
        if (obj.text !== next) {
          obj.set("text", next);
          touched = true;
        }
      });

      if (touched) canvas.requestRenderAll();
    };

    tick(); // paint immediately instead of waiting one second
    countdownIntervalRef.current = setInterval(tick, 1000);
  };

  // Restart the countdown whenever the canvas is ready or the saved calendar
  // date changes — so saving a new date in the sidebar immediately retargets
  // the day / hour / minute / second boxes.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !isLoaded) return;
    startCountdown(canvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, calendarDate]);
  //template function end

  //zoom function start
  // The single entry point for editor zoom — buttons, Ctrl +/-/0 and Ctrl+wheel
  // all land here. It only changes how large the artboard is DRAWN: the fabric
  // backstore, every object's left/top/width/height and the exported HTML are
  // untouched (see resizeCanvas / EDITOR_ZOOM_* for the reasoning).
  const applyEditorZoom = useCallback((next: number) => {
    const z = clampEditorZoom(next);
    const viewport = zoomViewportRef.current;
    // Zoom about the middle of what the user is looking at, so the artboard
    // stays centred instead of drifting towards the top-left as it grows.
    const before = viewport
      ? {
          x: (viewport.scrollLeft + viewport.clientWidth / 2) / Math.max(1, viewport.scrollWidth),
          y: (viewport.scrollTop + viewport.clientHeight / 2) / Math.max(1, viewport.scrollHeight),
        }
      : null;

    zoomRef.current = z;
    setZoom(z);
    // Synchronous relayout, so the scroll anchoring below reads the new size.
    fitCanvasRef.current();

    if (viewport && before) {
      viewport.scrollLeft = before.x * viewport.scrollWidth - viewport.clientWidth / 2;
      viewport.scrollTop = before.y * viewport.scrollHeight - viewport.clientHeight / 2;
    }
    // Nothing about the scene changed, but a re-render keeps the freshly
    // resized canvas crisp against its new CSS box.
    fabricRef.current?.requestRenderAll();
  }, []);
  applyZoomRef.current = applyEditorZoom;

  const zoomIn = () => applyEditorZoom(zoomRef.current + EDITOR_ZOOM_STEP);
  const zoomOut = () => applyEditorZoom(zoomRef.current - EDITOR_ZOOM_STEP);

  const resetZoom = () => {
    applyEditorZoom(1);
    // Back to the default view: centred, no pan offset.
    const viewport = zoomViewportRef.current;
    if (viewport) {
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
    }
  };
  //zoom function end

  //fullscreen function start
  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }

    // IMPORTANT: re-render after fullscreen
    setTimeout(() => {
      fabricRef.current?.requestRenderAll();
    }, 100);
  };
  toggleFullscreenRef.current = toggleFullscreen;
  // Which icon the fullscreen button shows. Driven by the browser's own event so
  // it stays right when fullscreen is left with Esc / F11 rather than the button.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  //fullscreen function end

  // Play a single, bounded preview of an animation on the active object, then
  // snap it back to its exact base values. One-shots end naturally at base;
  // loops (float/pulse) run a few cycles then restore. Pure obj.set + render —
  // it does not fire object:modified, so it never pollutes undo history.
  const previewAnimation = useCallback((type: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Stop/restore any preview already running (possibly on another object).
    if (previewRafRef.current != null) { cancelAnimationFrame(previewRafRef.current); previewRafRef.current = null; }
    if (previewRestoreRef.current) { previewRestoreRef.current(); previewRestoreRef.current = null; }

    const obj: any = canvas.getActiveObject();
    if (!obj || !type || type === 'none') return;

    const base = {
      top: obj.top ?? 0,
      opacity: obj.opacity ?? 1,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
    };
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
    const restore = () => {
      obj.set({ top: base.top, opacity: base.opacity, scaleX: base.scaleX, scaleY: base.scaleY });
      obj.setCoords?.();
      canvas.requestRenderAll();
    };
    previewRestoreRef.current = restore;

    // Loop presets preview for a bounded span; one-shots ignore this.
    const LOOP_MS = type === 'float' ? 6000 : type === 'pulse' ? 5400 : 0;
    if (type === 'fade-in') obj.set({ opacity: 0 });
    else if (type === 'slide-up') obj.set({ opacity: 0, top: base.top + 24 });
    else if (type === 'zoom-in') obj.set({ opacity: 0, scaleX: base.scaleX * 0.85, scaleY: base.scaleY * 0.85 });
    obj.setCoords?.();
    canvas.requestRenderAll();

    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      let done = false;
      switch (type) {
        case 'fade-in': {
          const p = Math.min(t / 600, 1);
          obj.opacity = base.opacity * easeOut(p);
          done = p >= 1;
          break;
        }
        case 'slide-up': {
          const p = Math.min(t / 600, 1);
          const e = easeOut(p);
          obj.opacity = base.opacity * e;
          obj.top = base.top + 24 * (1 - e);
          done = p >= 1;
          break;
        }
        case 'zoom-in': {
          const p = Math.min(t / 500, 1);
          const e = easeOut(p);
          obj.opacity = base.opacity * e;
          const s = 0.85 + 0.15 * e;
          obj.scaleX = base.scaleX * s;
          obj.scaleY = base.scaleY * s;
          done = p >= 1;
          break;
        }
        case 'float': {
          const off = -8 * (0.5 - 0.5 * Math.cos((t / 3000) * Math.PI * 2));
          obj.top = base.top + off;
          done = t >= LOOP_MS;
          break;
        }
        case 'pulse': {
          const s = 1 + 0.05 * (0.5 - 0.5 * Math.cos((t / 1800) * Math.PI * 2));
          obj.scaleX = base.scaleX * s;
          obj.scaleY = base.scaleY * s;
          done = t >= LOOP_MS;
          break;
        }
        default:
          done = true;
      }
      obj.setCoords?.();
      canvas.requestRenderAll();
      if (done) {
        restore();
        previewRafRef.current = null;
        previewRestoreRef.current = null;
      } else {
        previewRafRef.current = requestAnimationFrame(tick);
      }
    };
    previewRafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Phone edge gesture: hold, then swipe → new page ────────────────────────
  // A phone has no page bar (that row is `hidden pc:flex`), so the two slim
  // strips down the left and right of the canvas are how a page gets added
  // there. The hold is what makes it deliberate: a tap, a flick or a stray
  // thumb resting on the edge never adds anything — the finger has to sit
  // still for EDGE_HOLD_MS first, and only then does a sideways swipe count.
  const EDGE_HOLD_MS = 320;
  const EDGE_SWIPE_PX = 56;   // sideways travel that commits the new page
  const EDGE_CANCEL_PX = 14;  // moving further than this before the hold lands cancels it
  type EdgeSide = "left" | "right";

  // Render state (drives the strip's appearance); the ref below is the one the
  // pointer handlers read, so they never see a stale value mid-gesture.
  const [edgeGesture, setEdgeGesture] = useState<{ side: EdgeSide; armed: boolean } | null>(null);
  const edgeGestureRef = useRef<{
    side: EdgeSide;
    x: number;
    y: number;
    armed: boolean;
    fired: boolean;
  } | null>(null);
  const edgeHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pageToast, setPageToast] = useState<string | null>(null);
  const pageToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buzz = (pattern: number | number[]) => {
    try { navigator.vibrate?.(pattern); } catch { /* unsupported — silent */ }
  };

  const showPageToast = (message: string) => {
    setPageToast(message);
    if (pageToastTimerRef.current) clearTimeout(pageToastTimerRef.current);
    pageToastTimerRef.current = setTimeout(() => setPageToast(null), 1600);
  };

  // Hand the fabric swipe listeners (registered once, during init) this
  // render's page state and callbacks.
  pageNavRef.current = {
    goToPage,
    count: pages.length,
    current: currentPage,
    toast: showPageToast,
  };

  const endEdgeGesture = () => {
    if (edgeHoldTimerRef.current) {
      clearTimeout(edgeHoldTimerRef.current);
      edgeHoldTimerRef.current = null;
    }
    edgeGestureRef.current = null;
    setEdgeGesture(null);
  };

  useEffect(() => () => {
    if (edgeHoldTimerRef.current) clearTimeout(edgeHoldTimerRef.current);
    if (pageToastTimerRef.current) clearTimeout(pageToastTimerRef.current);
  }, []);

  const onEdgePointerDown = (side: EdgeSide) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Capture so the swipe keeps reporting to this strip once the finger has
    // travelled off it and over the canvas.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    edgeGestureRef.current = { side, x: e.clientX, y: e.clientY, armed: false, fired: false };
    setEdgeGesture({ side, armed: false });
    if (edgeHoldTimerRef.current) clearTimeout(edgeHoldTimerRef.current);
    edgeHoldTimerRef.current = setTimeout(() => {
      const g = edgeGestureRef.current;
      if (!g) return;
      g.armed = true;
      setEdgeGesture({ side: g.side, armed: true });
      buzz(10);
    }, EDGE_HOLD_MS);
  };

  const onEdgePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = edgeGestureRef.current;
    if (!g || g.fired) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.armed) {
      // Still holding — any real movement means this was a swipe/scroll, not a hold.
      if (Math.hypot(dx, dy) > EDGE_CANCEL_PX) endEdgeGesture();
      return;
    }
    // Armed: a mostly-horizontal swipe (either direction) adds the page.
    if (Math.abs(dx) >= EDGE_SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      g.fired = true;
      addPage();
      buzz([12, 40, 12]);
      showPageToast(`Page ${pages.length + 1} added`);
      endEdgeGesture();
    }
  };

  return (
    // Phone: the canvas gets the whole middle — every bit of padding here is
    // height the artboard loses, and there is no control bar below it either
    // (see the `hidden pc:flex` row at the end).
    <div className="w-full h-full flex flex-col gap-0 p-0 pc:gap-4 pc:p-6">

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImage}
        style={{ display: "none" }}
      />
      <input
        ref={musicInputRef}
        type="file"
        // Extensions listed alongside audio/* because some Android/Windows
        // pickers report an MP3 with a blank or generic MIME type and would
        // otherwise grey it out.
        accept="audio/*,audio/mpeg,.mp3,.m4a,.aac,.wav,.ogg,.flac"
        onChange={handleMusic}
        style={{ display: "none" }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        onChange={handleReplaceFile}
        style={{ display: "none" }}
      />

      {/* The dashed artboard frame is desktop-only: on a phone it sits well wide
          of the height-limited canvas, reading as a box around empty space. */}
      <div ref={containerRef} className="flex-grow border-0 pc:border pc:border-dashed border-[#282828] rounded overflow-hidden flex flex-col min-h-0 min-w-0">

      {/* ── Workspace ────────────────────────────────────────────────────────
          Three nested boxes, each with one job:
            workspace  — never scrolls, never changes with its content; the size
                         the artboard is fitted into, and the anchor for editor
                         chrome that must NOT zoom (music player, edge strips…).
            viewport   — the zoom viewport: scrolls when the zoomed artboard is
                         bigger than the workspace, so nothing is silently cut off.
            stage      — grows to the artboard (max-content, at least full size)
                         and centres it; everything in here scales with zoom. */}
      <div
  ref={workspaceRef}
  className={`relative overflow-hidden flex-1 min-h-0 min-w-0 w-full bg-[#FBF7F6] ${
    isDragOver ? 'ring-2 ring-dashed ring-brand-accent' : ''
  }`}
  onDragOver={onDragOver}
  onDrop={onDropHandler}
  onDragLeave={onDragLeave}
  onContextMenu={handleCanvasContextMenu}
>
        {/* Loading skeleton. Overlaid rather than a strip above the canvas: a
            padded strip steals height from the artboard, which is scarce on a
            phone. The skeleton's viewBox is CANVAS_REF_WIDTH x CANVAS_REF_HEIGHT,
            so "meet" lands it exactly on the artboard footprint at zoom 1 and it
            dissolves into the real invitation. z-40 clears the footer (z-30) and
            stays under the context menu (z-50). */}
        {skeletonMounted && (
          <div
            className={`absolute inset-0 z-40 bg-[#FBF7F6] transition-opacity duration-300 ${
              canvasReady ? 'opacity-0' : 'opacity-100'
            }`}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 40,
              background: '#FBF7F6',
              pointerEvents: 'none',
            }}
            aria-hidden={canvasReady}
          >
            <RsvpSkeleton className="h-full w-full" />
          </div>
        )}
        <div
          ref={zoomViewportRef}
          className={`absolute inset-0 overscroll-contain ${
            // Scrolling only exists where it is needed — above 100% the artboard
            // is larger than the workspace, so pan to reach the rest of it. At or
            // below 100% it fits by construction and nothing can be cut off, so
            // we keep the old clipping behaviour (a phone must never be able to
            // drag the artboard sideways by the overlay's sub-pixel overhang).
            zoom > 1 ? 'overflow-auto' : 'overflow-hidden'
          }`}
        >
          <div className="relative w-max h-max min-w-full min-h-full flex justify-center items-center">
<canvas ref={canvasEl} className="shadow block" />
          {/* Floating footer — pinned to the scaled canvas: same width, bottom edge,
              and the canvas's own (fit × zoom) scale, so it grows and shrinks with
              the artboard as one piece instead of tracking the workspace. */}
          {canvasBox && (
            <div
              className="absolute z-30"
              style={{
                left: canvasBox.left,
                top: canvasBox.top,
                width: canvasBox.width,
                height: canvasBox.height,
                pointerEvents: 'none',
              }}
            >
              <div
                ref={footerScaleDivRef}
                className="editor-footer"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: CANVAS_REF_WIDTH,
                  transformOrigin: 'bottom left',
                  transform: `scale(${canvasBox.scale})`,
                  pointerEvents: 'auto',
                }}
              >
                <EventFooter contacts={props.contacts} moneyGift={props.moneyGift} calendar={props.calendar} location={props.location} rsvpConfig={props.rsvpConfig} userId={props.userId} eventId={props.eventId} showRsvpAndMoneyGift={getPackageRules(props.packageId).showRsvpAndMoneyGift}/>
              </div>
            </div>
          )}
          </div>
        </div>

          {contextMenu && (
            <div
              className="fixed z-50 min-w-[200px] bg-white border border-neutral-200 rounded-lg shadow-xl py-1.5 text-sm text-neutral-800 select-none animate-in fade-in zoom-in-95 duration-100"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {contextMenu.isImage && (
                <>
                  <button
                    onClick={() => requestEditActiveImage(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                  >
                    <Pencil size={14} className="text-neutral-500" />
                    Edit image
                  </button>
                  <button
                    onClick={() => requestEditActiveImage(true)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                  >
                    <Crop size={14} className="text-neutral-500" />
                    Crop
                  </button>
                  <button
                    onClick={ctxReplaceImage}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                  >
                    <ImageUp size={14} className="text-neutral-500" />
                    Replace image
                  </button>
                  <button
                    onClick={() => { cloneFromOverlay(); setContextMenu(null); }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                  >
                    <Copy size={14} className="text-neutral-500" />
                    Duplicate
                  </button>
                  <div className="my-1 border-t border-neutral-100" />
                  <button
                    onClick={ctxDelete}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-red-50 text-red-600 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <div className="my-1 border-t border-neutral-100" />
                </>
              )}
              <button
                onClick={ctxCopy}
                className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Copy size={14} className="text-neutral-500" />
                  Copy
                </span>
                <span className="text-xs text-neutral-400">Ctrl+C</span>
              </button>
              <button
                onClick={ctxPaste}
                disabled={!clipboardRef.current}
                className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer disabled:text-neutral-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2.5">
                  <ClipboardPaste size={14} className={clipboardRef.current ? "text-neutral-500" : "text-neutral-300"} />
                  Paste
                </span>
                <span className="text-xs text-neutral-400">Ctrl+V</span>
              </button>
              <button
                onClick={ctxDelete}
                className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-red-50 text-red-600 cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Trash2 size={14} />
                  Delete
                </span>
                <span className="text-xs text-red-300">Del</span>
              </button>

              {(contextMenu.canGroup || contextMenu.isGroup) && (
                <>
                  <div className="my-1 border-t border-neutral-100" />
                  {contextMenu.canGroup && (
                    <button
                      onClick={doGroup}
                      className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <GroupIcon size={14} className="text-neutral-500" />
                        Group
                      </span>
                      <span className="text-xs text-neutral-400">Ctrl+G</span>
                    </button>
                  )}
                  {contextMenu.isGroup && (
                    <button
                      onClick={doUngroup}
                      className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <UngroupIcon size={14} className="text-neutral-500" />
                        Ungroup
                      </span>
                      <span className="text-xs text-neutral-400">Ctrl+Shift+G</span>
                    </button>
                  )}
                </>
              )}

              <div className="my-1 border-t border-neutral-100" />

              <button
                onClick={ctxBringFront}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
              >
                <ArrowUpToLine size={14} className="text-neutral-500" />
                Bring to Front
              </button>
              <button
                onClick={() => { bringForwardFromOverlay(); setContextMenu(null); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
              >
                <ArrowUp size={14} className="text-neutral-500" />
                Bring forward
              </button>
              <button
                onClick={() => { sendBackwardFromOverlay(); setContextMenu(null); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
              >
                <ArrowDown size={14} className="text-neutral-500" />
                Send backward
              </button>
              <button
                onClick={ctxSendBack}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
              >
                <ArrowDownToLine size={14} className="text-neutral-500" />
                Send to Back
              </button>

              <div className="my-1 border-t border-neutral-100" />

              <button
                onClick={ctxToggleVisible}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
              >
                {contextMenu.hidden ? (
                  <>
                    <Eye size={14} className="text-neutral-500" />
                    Show
                  </>
                ) : (
                  <>
                    <EyeOff size={14} className="text-neutral-500" />
                    Hide
                  </>
                )}
              </button>
              <button
                onClick={closeContextMenu}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 text-neutral-500 cursor-pointer"
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          )}
          {musicUrl && (
            <div className="absolute top-2 right-2 z-40">
              <MusicPlayer url={musicUrl} start={musicPlaying} />
            </div>
          )}

          {/* ── Phone-only "add page" edge strips ─────────────────────────────
              Hold one, then swipe sideways, and a page is appended. They sit
              above the canvas, so the outer ~20px of each side belongs to the
              gesture rather than to fabric — deliberate: the grip line marks
              it, and elements can still be dragged inwards off that band. */}
          {(["left", "right"] as const).map((side) => {
            const active = edgeGesture?.side === side;
            const armed = !!active && edgeGesture!.armed;
            return (
              <div
                key={side}
                role="button"
                aria-label="Hold and swipe to add a page"
                onPointerDown={onEdgePointerDown(side)}
                onPointerMove={onEdgePointerMove}
                onPointerUp={endEdgeGesture}
                onPointerCancel={endEdgeGesture}
                onLostPointerCapture={endEdgeGesture}
                style={{ touchAction: "none" }}
                className={`pc:hidden absolute top-0 bottom-0 ${
                  side === "left" ? "left-0" : "right-0"
                } w-[20px] z-30 flex items-center justify-center select-none transition-colors ${
                  armed ? "bg-[#7D5B59]/10" : ""
                }`}
              >
                <span
                  className={`w-[3px] rounded-full transition-all duration-200 ${
                    armed
                      ? "h-[120px] bg-[#7D5B59]"
                      : active
                      ? "h-[80px] bg-[#7D5B59]/60"
                      : "h-[56px] bg-[#7D5B59]/25"
                  }`}
                />
              </div>
            );
          })}

          {/* Told only once the hold has landed — before that there is nothing
              to explain, and the strip's grip line is doing the hinting. */}
          {edgeGesture?.armed && (
            <div className="pc:hidden absolute inset-x-0 top-3 z-40 flex justify-center pointer-events-none">
              <span className="rounded-full bg-[#7D5B59] text-white text-[11px] font-semibold px-3 py-1 shadow-lg">
                Swipe across to add a page
              </span>
            </div>
          )}

          {pageToast && (
            <div className="pc:hidden absolute inset-x-0 bottom-4 z-40 flex justify-center pointer-events-none">
              <span className="rounded-full bg-[#7D5B59] text-white text-[11px] font-semibold px-3 py-1 shadow-lg">
                {pageToast}
              </span>
            </div>
          )}

        </div>

      </div>

      {/* Editor chrome — desktop only. On a phone the middle of the screen is
          just the canvas: the tip, zoom, Reset/Fullscreen and page controls all
          stay hidden, and their jobs are done by touch gestures / the toolbar. */}
      <div className="hidden pc:flex items-center justify-between text-sm text-neutral-500 border-t pt-3">

  <div>
    Tip: Select objects to move/resize/rotate
  </div>

  {/* Zoom slider + icon controls. The slider is the whole zoom-in/zoom-out
      control: dragging it (or arrowing it, which range inputs do natively)
      steps through EDITOR_ZOOM_MIN…MAX in EDITOR_ZOOM_STEP increments. */}
  <div className="flex items-center gap-3">
  <input
    type="range"
    min={EDITOR_ZOOM_MIN}
    max={EDITOR_ZOOM_MAX}
    step={EDITOR_ZOOM_STEP}
    value={zoom}
    onChange={(e) => applyEditorZoom(parseFloat(e.target.value))}
    aria-label="Zoom"
    title={`Zoom ${Math.round(zoom * 100)}% — editor preview only, the invitation itself is unchanged`}
    className="w-32 h-1 accent-[#7D5B59] cursor-pointer"
  />
<span className="tabular-nums w-11 text-right select-none">
  {Math.round(zoom * 100)}%
</span>
<button
  onClick={resetZoom}
  title="Reset zoom (Ctrl 0)"
  aria-label="Reset zoom"
  className="p-1.5 rounded hover:bg-neutral-100 hover:text-[#7D5B59] transition-colors cursor-pointer"
>
  <RotateCcw size={16} />
</button>
<button
  onClick={toggleFullscreen}
  title={isFullscreen ? "Exit fullscreen (Ctrl F)" : "Fullscreen (Ctrl F)"}
  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
  className="p-1.5 rounded hover:bg-neutral-100 hover:text-[#7D5B59] transition-colors cursor-pointer"
>
  {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
</button>
  </div>
  <div className="flex items-center gap-3">
  <button
    onClick={() => goToPage(currentPage - 1)}
    disabled={currentPage === 0}
  >
    ◀
    
  </button>

  <span>
    Page {currentPage + 1} / {pages.length}
  </span>

  <button
    onClick={() => goToPage(currentPage + 1)}
    disabled={currentPage === pages.length - 1}
  >
    ▶
  </button>

  <button onClick={addPage}>
    + Page
  </button>
  <button
    onClick={() => removePage()}
    disabled={pages.length <= 1 || isCurrentPageEnvelope()}
    className="disabled:opacity-40 disabled:cursor-not-allowed"
    title={isCurrentPageEnvelope() ? "Cannot delete the envelope page" : "Delete current page"}
  >
    − Page
  </button>
</div>
</div>
    </div>
  );

  
});


export default CanvasEditor;
