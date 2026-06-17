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
import { Copy, Trash, Trash2, ClipboardPaste, ArrowUpToLine, ArrowDownToLine, Eye, EyeOff, X, Pencil, Crop, ImageUp, ArrowUp, ArrowDown, Type, Layers, ChevronDown } from "lucide-react";
import EventFooter from "../components/EventFooter";
import MusicPlayer from "../components/MusicPlayer";
import '../app/globals.css'
import TemplateList from "@/src/components/template-list";
import { envelopePage } from "@/src/components/template-list/EnvelopeTemplate";
import { galleryPage } from "@/src/components/template-list/galleryTemplate";
import { countdownPage } from "@/src/components/template-list/timeBoxTemplate";
import { guestbookPage } from "@/src/components/template-list/guestbookTemplate";
import { useEventDataOptional } from "@/src/store/EventDataContext";
import { useFabricEventSync } from "@/src/hooks/useFabricEventSync";
import { FONT_GROUPS, loadGoogleFont, collectFontFamilies, preloadFonts } from "@/src/lib/fonts";
import { downscaleImageFile } from "@/src/lib/imageDownscale";

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
  uploadImage: () => void;
  addImageFromUrl: (url: string) => void;
  addMusicFromUrl: (url: string) => void;
  uploadMusic: () => void;
  loadTemplate: (pages: any[]) => void;
  addGalleryPage: () => void;
  removeGalleryPage: () => void;
  hasGalleryPage: () => boolean;
  addPhotoToGallery: (url: string) => void;
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
  getProjectData: () => { pages: any[]; currentPage: number; musicUrl: string | null };
  getThumbnail: () => string;
  goToPage: (index: number) => void;
  reorderPages: (from: number, to: number) => void;
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
}
const MAX_HISTORY = 50;
const HISTORY_DEBOUNCE_MS = 120;
// Backstore dimensions of the canvas. The footer is designed against this width,
// so we scale it by the same factor the canvas is CSS-scaled to fit its wrap.
const CANVAS_REF_WIDTH = 396;
const CANVAS_REF_HEIGHT = 704;
type PageHistory = { undo: string[]; redo: string[] };
const FABRIC_EXPORT_PROPS = [
  "action",
  "animationType",
  "animation",
  "musicUrl",
  "linkUrl",
  "url",
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
    initialPages?: any[] | null;
    initialMusicUrl?: string | null;
    contacts: any[];
    moneyGift: any;
    calendar: any;
    location: any;
    rsvpConfig?: {
      navColor: string;
      navOpacity: number;
      textColor: string;
      textOpacity: number;
    };
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
  // Flat color drawn behind the background picture (and used when a picture is
  // removed). Tracks the last solid color the user picked.
  const bgFlatColorRef = useRef<string>('#ffffff');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [musicUrl, setMusicUrl] = useState<string | null>(props.initialMusicUrl ?? null);
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hidden: boolean; isImage: boolean } | null>(null);
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
  // The background most recently pushed via "Apply to all pages". New pages
  // inherit it so an all-pages background also covers pages created later.
  const globalBgRef = useRef<{ backgroundImage?: any; backgroundColor?: any } | null>(null);
  const toggleFullscreenRef = useRef<() => void>(() => {});
  const textToolRef = useRef(false);
  const textToolStartRef = useRef<{ x: number; y: number } | null>(null);
  const textToolDraggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasHydratedRef = useRef(false);
  // In-flight animation preview on the editor canvas. previewRestoreRef snaps the
  // previewed object back to its captured base values when the preview ends/cancels.
  const previewRafRef = useRef<number | null>(null);
  const previewRestoreRef = useRef<(() => void) | null>(null);

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
      // The active page's object list just changed (page switch, undo/redo,
      // template load) — refresh the Layer tab.
      onLayersChangeRef.current?.();
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

    fabric.util.enlivenObjects(defs).then((objs: any[]) => {
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

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    canUndo,
    canRedo,
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
        rsvpConfig: props.rsvpConfig ?? null,
        borders: globalBordersRef.current,
      };
      try {
        sessionStorage.setItem("viup_local_preview", JSON.stringify(payload));
        window.open("/preview-local", "_blank");
      } catch (e) {
        console.error("[previewLocal] failed", e);
        alert("Local preview failed: " + (e as Error).message);
      }
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
    setGallerySlideInterval,
    updateActiveObject: (props: Record<string, any>) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      active.set(props);
      canvas.requestRenderAll();
      // A font-family change needs the webfont loaded, then a re-measure so the
      // text box reflows against the real glyphs (Inspector path).
      if (props.fontFamily) {
        loadGoogleFont(props.fontFamily).then(() => {
          const obj = canvas.getActiveObject();
          if (obj && (obj as any).fontFamily === props.fontFamily) {
            (obj as any).initDimensions?.();
            obj.setCoords?.();
            canvas.requestRenderAll();
          }
        });
      }
      pushSnapshot();
    },
    deleteActiveObject: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      canvas.remove(active);
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
      const imgOpts = url.startsWith('data:') ? undefined : { crossOrigin: 'anonymous' };

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
      return (obj as any).getSrc?.() ?? (obj as any)._element?.src ?? null;
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
      return { pages: exportedPages, currentPage, musicUrl };
    },
    getThumbnail: () => {
      const canvas = fabricRef.current;
      if (!canvas) return "";
      try {
        // Lightweight: small multiplier + JPEG keeps the dataURL to a few KB.
        return canvas.toDataURL({ format: "jpeg", quality: 0.6, multiplier: 0.25 });
      } catch (e) {
        console.error("[CanvasEditor] thumbnail export failed", e);
        return "";
      }
    },

    // ── Layer tab ───────────────────────────────────────────────────────────
    getLayers: () => {
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

        canvas.on('mouse:down', (opt: any) => {
          if (opt?.e?.button !== 2) return;
          const target = opt.target;
          if (!target) {
            setContextMenu(null);
            return;
          }
          canvas.setActiveObject(target);
          canvas.requestRenderAll();
          setContextMenu({
            x: opt.e.clientX,
            y: opt.e.clientY,
            hidden: target.visible === false,
            isImage: target.type === 'image',
          });
        });

        // initial size — use explicit pixel dimensions so Fabric can render correctly
        const initialWidth = CANVAS_REF_WIDTH;
        const initialHeight = CANVAS_REF_HEIGHT;
        canvas.setDimensions({ width: initialWidth, height: initialHeight });
        fabricRef.current = canvas;

        // Load first page after canvas is ready. replaceCanvasContent guards the restore
        // flag so object:added events fired during enliven don't enter history.
        setTimeout(() => {
          const initialPage = pages[0] ?? null;
          replaceCanvasContent(initialPage, () => {
            // Seed baseline history for page 0 so the first undo has something to step back to.
            commitSnapshot();
            hasHydratedRef.current = true;
          });
        }, 0);

        // resize handler: fit canvas (CSS only) inside its wrap while preserving
        // aspect ratio. Backstore dimensions stay at initialWidth x initialHeight
        // so object coordinates and the user's manual zoom (setZoom) keep working.
        const resizeCanvas = () => {
          const el = canvasEl.current;
          if (!el || !fabricRef.current) return;
          // el.parentElement is fabric's .canvas-container; its parent is our wrap.
          const wrap = el.parentElement?.parentElement;
          if (!wrap) return;
          const availW = wrap.clientWidth;
          const availH = wrap.clientHeight;
          if (availW <= 0 || availH <= 0) return;
          const scale = Math.min(availW / initialWidth, availH / initialHeight);
          if (!isFinite(scale) || scale <= 0) return;
          const displayW = initialWidth * scale;
          const displayH = initialHeight * scale;
          fabricRef.current.setDimensions(
            { width: displayW, height: displayH },
            { cssOnly: true }
          );
          // Record where the canvas actually renders inside the wrap so the
          // floating footer can be pinned to its bottom edge at the same scale.
          const container = el.parentElement; // fabric's .canvas-container
          const wrapRect = wrap.getBoundingClientRect();
          const cRect = (container ?? el).getBoundingClientRect();
          setCanvasBox({
            left: cRect.left - wrapRect.left,
            top: cRect.top - wrapRect.top,
            width: displayW,
            height: displayH,
            scale,
          });
        };

        // run once, on window resize, and whenever the wrap itself changes size
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        const wrapEl = elAtMount.parentElement?.parentElement;
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

          if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            const next = Math.min(zoomRef.current + 0.1, 3);
            c.setZoom(next);
            zoomRef.current = next;
            setZoom(next);
            c.requestRenderAll();
            return;
          }

          if (e.ctrlKey && e.key === '-') {
            e.preventDefault();
            const next = Math.max(zoomRef.current - 0.1, 0.3);
            c.setZoom(next);
            zoomRef.current = next;
            setZoom(next);
            c.requestRenderAll();
            return;
          }

          if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            c.setZoom(1);
            zoomRef.current = 1;
            setZoom(1);
            c.requestRenderAll();
            return;
          }

          if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
            e.preventDefault();
            c.setViewportTransform([1, 0, 0, 1, 0, 0]);
            c.setZoom(1);
            zoomRef.current = 1;
            setZoom(1);
            c.requestRenderAll();
            return;
          }

          const active = c.getActiveObject();
          if (!active) return;
          if ((active as any).isEditing) return;
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            c.remove(active);
            c.discardActiveObject();
            c.requestRenderAll();
            schedulePush();
            setOverlay(null);
            if (typeof props.onSelectionChange === 'function') props.onSelectionChange(null);
          }
        };
        window.addEventListener('keydown', handleKeyDown);
        cleanupKeyboard = () => window.removeEventListener('keydown', handleKeyDown);

        const handleWheel = (e: WheelEvent) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          const canvas = fabricRef.current;
          if (!canvas) return;
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          const next = Math.min(Math.max(zoomRef.current + delta, 0.3), 3);
          canvas.setZoom(next);
          zoomRef.current = next;
          setZoom(next);
          canvas.requestRenderAll();
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

    const props = { left: 80, top: 80, fontSize: 36, fill: "#111827", ...opts };
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
          const img = await fabric.Image.fromURL(dataUrl);
          img.set({ left: x, top: y, scaleX: 0.6, scaleY: 0.6 });
          canvas.add(img);
          canvas.requestRenderAll();
          pushSnapshot();
        } catch (err) {
          console.error('Failed to load dropped file image', err);
        }
      });
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
          const imgOpts = data.url.startsWith('data:') ? undefined : { crossOrigin: 'anonymous' };
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
    const active = canvas.getActiveObject();
    if (!active) return;
    canvas.remove(active);
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

  // Native right-click handler on the canvas wrap. Fabric 7's `fireRightClick`
  // mouse:down event is unreliable, so we resolve the target ourselves via
  // findTarget (falling back to the current selection) and open our menu.
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    e.preventDefault();

    const objects = canvas.getObjects();
    // Resolve what was right-clicked. findTarget can return non-object values
    // across Fabric versions, so only accept something that's actually on the
    // canvas. Fall back to the current selection (the user usually clicks first).
    let target: any = null;
    try {
      const found = (canvas as any).findTarget?.(e.nativeEvent);
      if (found && objects.includes(found)) target = found;
    } catch {
      target = null;
    }
    if (!target) {
      const active = canvas.getActiveObject() as any;
      if (active && objects.includes(active)) target = active;
    }
    if (!target) {
      setContextMenu(null);
      return;
    }

    // Make it the active object (guard the call — only real, on-canvas objects).
    if (canvas.getActiveObject() !== target && typeof target.onSelect === "function") {
      try {
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
      } catch {
        /* ignore — still show the menu for the resolved target */
      }
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hidden: target.visible === false,
      isImage: target.type === 'image',
    });
  }, []);

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

    const idx = canvas.getObjects().indexOf(obj);
    const oldW = typeof obj.getScaledWidth === 'function' ? obj.getScaledWidth() : (obj.width ?? 0) * (obj.scaleX ?? 1);
    const oldH = typeof obj.getScaledHeight === 'function' ? obj.getScaledHeight() : (obj.height ?? 0) * (obj.scaleY ?? 1);

    fabric.Image.fromURL(dataUrl).then((img: any) => {
      const nW = img.width || 1;
      const nH = img.height || 1;
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
      // Preserve exported metadata (action, animation, id, name, etc.).
      FABRIC_EXPORT_PROPS.forEach((p) => {
        if ((obj as any)[p] !== undefined) (img as any)[p] = (obj as any)[p];
      });
      canvas.remove(obj);
      canvas.add(img);
      if (idx >= 0) (canvas as any).moveObjectTo?.(img, idx);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
      editingImageRef.current = null;
    }).catch((err: any) => console.error('Failed to replace image', err));
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
    });
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
        const img = await fabric.Image.fromURL(dataUrl);
        img.set({ left: 100, top: 100, scaleX: 0.6, scaleY: 0.6 });
        canvas.add(img);
        canvas.requestRenderAll();
        pushSnapshot();
      } catch (err) {
        console.error('Failed to load uploaded image', err);
      }
    });
    // reset input so same file can be reselected
    e.currentTarget.value = "";
  }, []);

  const handleMusic = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const input = e.currentTarget;

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-music", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        setMusicUrl(data.url);
      } else {
        alert("Music upload failed: " + (data?.error ?? "unknown error"));
      }
    } catch (err) {
      console.error("Music upload failed", err);
      alert("Music upload failed");
    } finally {
      input.value = "";
    }
  }, []);

  const addImageFromUrl = useCallback((url: string) => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric || !url) return;

    const imgOpts = url.startsWith('data:') ? undefined : { crossOrigin: 'anonymous' };
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
    console.log("Music added:", url);
  }, []);

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
    const imgOpts = url.startsWith('data:') ? undefined : { crossOrigin: 'anonymous' };
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
    const dataUrl = canvas.toDataURL({ multiplier: 1, format: "png", quality: 0.92 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "wedding-design.png";
    a.click();
  }, []);

 const exportHTML = useCallback(async (eventName?: string): Promise<string> => {
  const canvas = fabricRef.current;
  const fabric = fabricModuleRef.current;
  if (!canvas || !fabric) return "rsvp";

  const currentPageJson = serializeCanvas(canvas);
  const exportedPages = pages.map((page, index) => {
    if (index === currentPage) return currentPageJson;
    return page ?? null;
  });

  console.log("[export] page[0] objects:", exportedPages[0]?.objects?.map((o: any) => ({ type: o.type, name: o.name, src: String(o.src ?? "").slice(0, 60) })));

  const res = await fetch("/api/export-to-rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pages: exportedPages,
      musicUrl,
      eventName: eventName ?? "",
      contacts: props.contacts,
      moneyGift: props.moneyGift,
      calendar: props.calendar,
      location: props.location,
      rsvpConfig: props.rsvpConfig ?? null,
      borders: globalBordersRef.current,
    }),
  });

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    return data.slug ?? "rsvp";
  } else {
    const err = await res.json().catch(() => ({}));
    alert("Export failed: " + (err.error ?? "unknown error"));
    return "rsvp";
  }
}, [currentPage, musicUrl, pages, serializeCanvas, props]);

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

  const removePage = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (pages.length <= 1) return; // keep at least one page
    if (typeof window !== 'undefined' && !window.confirm(`Delete page ${currentPage + 1}? This cannot be undone.`)) return;
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
      const imgOpts = url.startsWith('data:') ? undefined : { crossOrigin: 'anonymous' };
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
  const zoomIn = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const next = Math.min(zoom + 0.1, 3);
    canvas.setZoom(next);
    zoomRef.current = next;
    setZoom(next);
    canvas.requestRenderAll();
  };
  
  const zoomOut = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const next = Math.max(zoom - 0.1, 0.3);
    canvas.setZoom(next);
    zoomRef.current = next;
    setZoom(next);
    canvas.requestRenderAll();
  };

  const resetZoom = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.setZoom(1);
    zoomRef.current = 1;
    setZoom(1);
    canvas.requestRenderAll();
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

  return (
    <div className="w-full h-full flex flex-col gap-4 p-6">

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
        accept="audio/*"
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

      <div ref={containerRef} className="flex-grow border border-dashed border-[#282828] rounded overflow-hidden flex flex-col min-h-0 min-w-0">
        <div className="flex justify-center items-center p-4 bg-[#282828]">
          {!isLoaded && <span className="text-neutral-200">Initializing canvas...</span>}
        </div>

      <div
  className={`relative flex justify-center items-center overflow-hidden flex-1 min-h-0 min-w-0 w-full bg-[#282828] ${
    isDragOver ? 'ring-2 ring-dashed ring-brand-accent' : ''
  }`}
  onDragOver={onDragOver}
  onDrop={onDropHandler}
  onDragLeave={onDragLeave}
  onContextMenu={handleCanvasContextMenu}
>


<canvas ref={canvasEl} className="shadow block max-w-full h-auto" />
          {/* Floating footer — pinned to the scaled canvas: same width, bottom edge,
              and fit-scale so it tracks the canvas instead of the whole wrap. */}
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
                <EventFooter contacts={props.contacts} moneyGift={props.moneyGift} calendar={props.calendar} location={props.location} rsvpConfig={props.rsvpConfig}/>
              </div>
            </div>
          )}

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
              <MusicPlayer url={musicUrl} start />
            </div>
          )}

        </div>

      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500 border-t pt-3">

  <div>
    Tip: Select objects to move/resize/rotate
  </div>

  <div className="flex items-center gap-2">
  <button onClick={zoomOut}>-</button>
<button onClick={zoomIn}>+</button>
<button onClick={resetZoom}>Reset</button>
<button onClick={toggleFullscreen}>Fullscreen</button>
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
    onClick={removePage}
    disabled={pages.length <= 1}
    className="disabled:opacity-40 disabled:cursor-not-allowed"
  >
    − Page
  </button>
</div>
</div>
    </div>
  );

  
});


export default CanvasEditor;
