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
import { Copy, Trash, Trash2, ClipboardPaste, ArrowUpToLine, ArrowDownToLine, Eye, EyeOff, X, Pencil, Crop, ImageUp, ArrowUp, ArrowDown, Type } from "lucide-react";
import EventFooter from "../components/EventFooter";
import '../app/globals.css'
import TemplateList from "@/src/components/template-list";
import { envelopePage } from "@/src/components/template-list/EnvelopeTemplate";
import { useEventDataOptional } from "@/src/store/EventDataContext";
import { useFabricEventSync } from "@/src/hooks/useFabricEventSync";
import { FONT_GROUPS, loadGoogleFont, collectFontFamilies, preloadFonts } from "@/src/lib/fonts";
export type EditorHandle = {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  save: () => void;
  exportPNG: () => void;
  exportHTML: (eventName?: string) => Promise<string>;
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
  addText: (text?: string, opts?: Record<string, any>) => void;
  enterTextTool: () => void;
  exitTextTool: () => void;
  uploadImage: () => void;
  addImageFromUrl: (url: string) => void;
  addMusicFromUrl: (url: string) => void;
  uploadMusic: () => void;
  loadTemplate: (pages: any[]) => void;
  addBorder: (url: string) => void;
  setBackgroundColor: (color: string) => void;
  previewAnimation: (type: string) => void;
  getActiveImageSrc: () => string | null;
  replaceActiveImage: (dataUrl: string) => void;
  isActiveObjectImage: () => boolean;
  getProjectData: () => { pages: any[]; currentPage: number; musicUrl: string | null };
  getThumbnail: () => string;
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
] as const;


const CanvasEditor = forwardRef<
  EditorHandle, 
  {
    onSelectionChange?: (obj: any | null) => void;
    onEditImage?: (src: string, opts?: { crop?: boolean }) => void;
    onCanvasChange?: () => void;
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
  const countdownIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const globalBordersRef = useRef<{ url: string; id: string }[]>([]);
  const [overlay, setOverlay] = useState<{ left: number; top: number; width: number; height: number; isImage: boolean; isText: boolean; fontFamily: string } | null>(null);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
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
    return (canvas as any).toJSON([...FABRIC_EXPORT_PROPS]);
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

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    canUndo,
    canRedo,
    save: saveLocal,
    
    exportPNG,
    exportHTML,
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
    setBackgroundColor: (color: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.backgroundColor = color;
      canvas.requestRenderAll();
      pushSnapshot();
      saveCurrentPage(currentPageRef.current);
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
          fireRightClick: true,
          stopContextMenu: true,
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
        };

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

        canvas.on('selection:created', () => { stopPreview(); onSelectionChange(); updateOverlayFromActive(); });
        canvas.on('selection:updated', () => { stopPreview(); onSelectionChange(); updateOverlayFromActive(); });
        canvas.on('selection:cleared', () => { stopPreview(); onSelectionChange(); setOverlay(null); });

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
        window.clearInterval(countdownIntervalRef.current);
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
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const img = await fabric.Image.fromURL(dataUrl);
          img.set({ left: x, top: y, scaleX: 0.6, scaleY: 0.6 });
          canvas.add(img);
          canvas.requestRenderAll();
          pushSnapshot();
        } catch (err) {
          console.error('Failed to load dropped file image', err);
        }
      };
      reader.readAsDataURL(file);
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

  // Dismiss the font menu on any outside click (its own clicks stopPropagation).
  useEffect(() => {
    if (!fontMenuOpen) return;
    const onDown = () => setFontMenuOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [fontMenuOpen]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const obj = editingImageRef.current ?? fabricRef.current?.getActiveObject();
      replaceObjectImage(obj, dataUrl);
      input.value = '';
    };
    reader.readAsDataURL(file);
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

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const img = await fabric.Image.fromURL(dataUrl);
        img.set({ left: 100, top: 100, scaleX: 0.6, scaleY: 0.6 });
        canvas.add(img);
        canvas.requestRenderAll();
        pushSnapshot();
      } catch (err) {
        console.error('Failed to load uploaded image', err);
      }
    };
    reader.readAsDataURL(file);
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
    setPages(prev => {
      const updated = [...prev];
      updated[prevIndex] = currentJSON;
      updated.push(null);
      return updated;
    });
    replaceCanvasContent(null, () => {
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

  //pages function end

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
const startCountdown = (canvas: FabricCanvas) => {
  const targetDate = new Date("2026-04-26T00:00:00");

  setInterval(() => {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();

    if (diff <= 0) return;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const values = [days, hours, minutes, seconds];

    let index = 0;

    canvas.getObjects().forEach((obj: any) => {
  if (obj.type === "textbox") {
    const textbox = obj as any & { countdownUnit?: string };

    switch (textbox.countdownUnit) {
      case "day":
        textbox.set("text", String(days).padStart(2, "0"));
        break;

      case "hour":
        textbox.set("text", String(hours).padStart(2, "0"));
        break;

      case "minute":
        textbox.set("text", String(minutes).padStart(2, "0"));
        break;

      case "second":
        textbox.set("text", String(seconds).padStart(2, "0"));
        break;
    }
  }
});

    canvas.renderAll();
  }, 20);
};
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

      <div ref={containerRef} className="flex-grow border border-dashed border-neutral-300 rounded overflow-hidden flex flex-col min-h-0 min-w-0">
        <div className="flex justify-center items-center p-4 bg-neutral-50">
          {!isLoaded && <span>Initializing canvas...</span>}
        </div>

      <div
  className={`relative flex justify-center items-center overflow-hidden flex-1 min-h-0 min-w-0 w-full ${
    isDragOver ? 'ring-2 ring-dashed ring-brand-accent' : ''
  }`}
  onDragOver={onDragOver}
  onDrop={onDropHandler}
  onDragLeave={onDragLeave}
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

          {overlay && (
            <>
              {/* overlay buttons */}
            </>
          )}


          {/* Overlay toolbar — anchored to top-right corner of selection */}
          {overlay && (
            <div
              className="absolute z-20 flex gap-1"
              style={{
                left: overlay.left + overlay.width,
                top: overlay.top - 16,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {overlay.isImage && (
                <button
                  onClick={(e) => { e.stopPropagation(); requestEditActiveImage(false); }}
                  aria-label="Edit selected image"
                  className="bg-white text-black rounded-full p-1 border border-neutral-300 hover:bg-neutral-100 cursor-pointer shadow"
                >
                  <Pencil size={14} />
                </button>
              )}
              {overlay.isText && (
                <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFontMenuOpen((o) => !o); }}
                    aria-label="Change font"
                    title="Change font"
                    className="bg-white text-black rounded-full p-1 border border-neutral-300 hover:bg-neutral-100 cursor-pointer shadow"
                  >
                    <Type size={14} />
                  </button>
                  {fontMenuOpen && (
                    <div className="absolute top-full right-0 mt-1 max-h-64 w-[180px] overflow-auto bg-white border border-neutral-200 rounded-lg shadow-xl py-1 z-30 text-sm">
                      {FONT_GROUPS.map((group) => (
                        <div key={group.label}>
                          <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 sticky top-0 bg-white">
                            {group.label}
                          </div>
                          {group.fonts.map((f) => (
                            <button
                              key={f}
                              onClick={(e) => { e.stopPropagation(); setActiveFont(f); setFontMenuOpen(false); }}
                              className={`w-full text-left px-3 py-1.5 hover:bg-neutral-100 cursor-pointer truncate ${overlay.fontFamily === f ? 'bg-neutral-100 font-semibold' : ''}`}
                              style={{ fontFamily: f }}
                              onMouseEnter={() => loadGoogleFont(f)}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); bringToFrontFromOverlay(); }}
                aria-label="Send to front"
                title="Send to front"
                className="bg-white text-black rounded-full p-1 border border-neutral-300 hover:bg-neutral-100 cursor-pointer shadow"
              >
                <ArrowUpToLine size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); sendToBackFromOverlay(); }}
                aria-label="Send to back"
                title="Send to back"
                className="bg-white text-black rounded-full p-1 border border-neutral-300 hover:bg-neutral-100 cursor-pointer shadow"
              >
                <ArrowDownToLine size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); cloneFromOverlay(); }}
                aria-label="Clone selected object"
                className="bg-white text-black rounded-full p-1 border border-neutral-300 hover:bg-neutral-100 cursor-pointer shadow"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteFromOverlay(); }}
                aria-label="Delete selected object"
                className="bg-red-600 text-white rounded-full p-1 border border-red-600 hover:bg-red-700 cursor-pointer shadow"
              >
                <Trash2 size={14} />
              </button>
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
                    onClick={() => {
                      const c = fabricRef.current; const a = c?.getActiveObject();
                      if (c && a) { const objs = c.getObjects(); const i = objs.indexOf(a); if (i < objs.length - 1) { (c as any).moveObjectTo(a, i + 1); c.requestRenderAll(); pushSnapshot(); } }
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                  >
                    <ArrowUp size={14} className="text-neutral-500" />
                    Bring forward
                  </button>
                  <button
                    onClick={() => {
                      const c = fabricRef.current; const a = c?.getActiveObject();
                      if (c && a) { const objs = c.getObjects(); const i = objs.indexOf(a); if (i > 0) { (c as any).moveObjectTo(a, i - 1); c.requestRenderAll(); pushSnapshot(); } }
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
                  >
                    <ArrowDown size={14} className="text-neutral-500" />
                    Send backward
                  </button>
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
            <audio
              src={musicUrl}
              autoPlay
              loop
              controls
              className="absolute top-2 right-2 z-40 opacity-0"
            />
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
