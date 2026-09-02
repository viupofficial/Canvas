//what does this code do

'use client';

import { Upload, LogIn, Link2, FileText, Check, Loader2, Gift, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { RefObject, useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation"; // ✅ ADD THIS
import { EditorHandle } from "@/src/components/CanvasEditor";
import {
  getCanvasUser,
  clearCanvasUser,
  avatarFor,
  type CanvasUser,
} from "@/src/lib/userSession";
import { publishAndSyncCanvas } from "@/src/lib/publishEvent";
import { eventSlug } from "@/src/lib/slug";
import PdfExportModal from "@/src/components/canvas-editor/PdfExportModal";

/**
 * EditorHeader component
 * 
 * This component renders the header of the canvas editor
 * containing the navigation buttons and the share button
 * 
 * @param {Object} props - The props object
 * @param {RefObject<EditorHandle>} props.editorRef - The reference to the canvas editor
 * @param {Function} [props.onUndo] - The callback function for the undo button
 * @param {Function} [props.onRedo] - The callback function for the redo button
 * @param {Function} [props.onSave] - The callback function for the save button
 * @param {Function} [props.onPreview] - The callback function for the preview button
 * @param {Function} [props.onUpgrade] - The callback function for the upgrade button
 * @param {Function} [props.onProfile] - The callback function for the profile button
 * @param {Function} [props.onShare] - The callback function for the share button
 * @returns {React.ReactElement} - The rendered component
 */
export default function EditorHeader(props: {
  editorRef: RefObject<EditorHandle>;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  /**
   * "Live Preview": publishes exactly like Share Link (blob + iFastNet sync)
   * and then opens the hosted page. May return a promise — the menu item stays
   * disabled with a spinner until it settles, so one click = one publish.
   */
  onPreview?: () => void | Promise<void>;
  onPreviewLocal?: () => void;
  onUpgrade?: () => void;
  onProfile?: () => void;
  onShare?: () => void;
  onLogin?: () => void;
  /**
   * Teaser mode: a standalone "try the editor" experience.
   * - The logo does NOT link back to the homepage filing system.
   * - The user profile dropdown is hidden.
   * - The Share button becomes a Login button.
   */
  teaser?: boolean;
  /**
   * Experience mode for the new split editor/designer flows.
   * - "editor": locked to one event — no dashboard/back navigation.
   * - "designer" / "designer-event": full designer navigation allowed.
   * Legacy callers omit this and rely on the path-based home gate below.
   */
  mode?: "editor" | "designer" | "designer-event";
  /**
   * Explicit destination for the logo. When provided it overrides the
   * path-based gate: a value makes the logo a link, `null`/`undefined` (with a
   * mode set) makes it decorative.
   */
  homeHref?: string | null;
  eventName?: string;
  onEventNameChange?: (name: string) => void;
  /**
   * Status of the debounced title autosync (event-bound canvases). Drives the
   * small icon next to the title input so the user sees when their title edit is
   * being saved to PHP, has saved, or failed. Omitted/"idle" shows nothing.
   */
  titleSyncStatus?: "idle" | "saving" | "saved" | "error";
  titleSyncError?: string;
  /**
   * Renders the event title as read-only. Set for actors who may edit the
   * canvas but not rename the event — a collaborator — because the title drives
   * the PUBLIC invitation slug (https://vi-up.com/e/{title-slug}) and renaming
   * it would break links guests already hold. Owners and designers leave this
   * off and keep the existing editable title.
   */
  titleReadOnly?: boolean;
  /**
   * Flush a pending title edit to PHP and resolve once it landed. Share Link
   * awaits this before publishing: PHP derives the public page's slug and title
   * from events.event_name, so publishing while a rename is still sitting in the
   * 1s debounce would hand back a link named after the PREVIOUS title. Never
   * rejects — a title that cannot sync must not block the share.
   */
  onFlushTitle?: () => Promise<void>;
  /**
   * Identity of the event this canvas belongs to. Share Link needs it twice:
   * the published blob is keyed on the event id, and the same ids are reported
   * to iFastNet after publishing so PHP knows which canvas serves the event.
   * Absent on legacy project / teaser canvases, where Share Link cannot publish.
   */
  userId?: number | null;
  eventId?: number | null;
  designId?: number | null;
  packageId?: number | null;
  /**
   * Page state, mirrored from the editor. Only the phone ⋮ menu uses it — that
   * menu is the phone's page control, since the desktop page bar under the
   * canvas is hidden below 500px.
   */
  pageCount?: number;
  currentPageIndex?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // ── HOME LINK GATE ───────────────────────────────────────────────────────
  // New split flows pass an explicit `mode` + `homeHref`. Editor mode is locked
  // to its event, so the logo never navigates back into the app. Otherwise fall
  // back to the legacy rule: only /designer may return to the filing system.
  const { mode, homeHref } = props;
  const canGoHome = mode
    ? mode !== "editor" && !!homeHref
    : !!pathname && pathname.startsWith("/designer");
  const resolvedHomeHref = mode ? homeHref ?? "/" : "/";

  // ── PROFILE DROPDOWN ─────────────────────────────────────────────────────
  // Reads the session that the /[userId] login-landing route stored in
  // localStorage (viup_canvas_user). `undefined` = not yet checked (client),
  // `null` = checked and nobody is logged in.
  const [user, setUser] = useState<CanvasUser | null | undefined>(undefined);
  useEffect(() => {
    setUser(getCanvasUser());
  }, []);

  const username = user?.name ?? "";
  const imgSrc   = avatarFor(user ?? null);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef  = useRef<HTMLDivElement>(null);

  // ── SHARE DROPDOWN ───────────────────────────────────────────────────────
  // `shareStatus` drives per-item feedback: generating/copying the link or
  // rendering the PDF, so the user knows the async work is in flight.
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "link" | "copied">("idle");
  // Last Share Link failure, shown inside the dropdown. Cleared on every retry —
  // publishing and syncing are both idempotent, so retrying is always safe.
  const [shareError, setShareError] = useState("");

  // "Share PDF" no longer downloads on click: it opens an export panel that
  // previews the sheet and lets the user set paper/fit/margin/pages first.
  const [pdfOpen, setPdfOpen] = useState(false);

  // ── PREVIEW DROPDOWN ─────────────────────────────────────────────────────
  // The preview button opens a menu: "Live" publishes/uploads then opens the
  // hosted /e/{slug} page; "Local" previews in-place without uploading.
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  // "live" while the publish + sync is in flight — same duplicate-click guard as
  // Share Link, since Live Preview now runs the identical publish flow.
  const [previewStatus, setPreviewStatus] = useState<"idle" | "live">("idle");

  // ── PHONE ⋮ MENU (page actions) ──────────────────────────────────────────
  // Deleting a page is destructive and there is no undo for it, so the item
  // arms itself first and only deletes on the second tap.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) {
        setPreviewOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
        setDeleteArmed(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const [localEventName, setLocalEventName] = useState("Bride & Groom");
  const eventName = props.eventName ?? localEventName;
  const titleReadOnly = !!props.titleReadOnly;
  const setEventName = (name: string) => {
    if (titleReadOnly) return;
    setLocalEventName(name);
    props.onEventNameChange?.(name);
  };

  // ── CLOUD SAVE FLASH ─────────────────────────────────────────────────────
  // Briefly tint the brown cloud-save icon green each time a title edit finishes
  // syncing (titleSyncStatus flips to "saved"). Repeated saves reset the timer,
  // and the pending timeout is cleared on unmount.
  const [cloudFlashGreen, setCloudFlashGreen] = useState(false);
  const cloudFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (props.titleSyncStatus !== "saved") return;
    setCloudFlashGreen(true);
    if (cloudFlashTimer.current) clearTimeout(cloudFlashTimer.current);
    cloudFlashTimer.current = setTimeout(() => setCloudFlashGreen(false), 1200);
  }, [props.titleSyncStatus]);
  useEffect(
    () => () => {
      if (cloudFlashTimer.current) clearTimeout(cloudFlashTimer.current);
    },
    [],
  );

  const { editorRef, onUndo, onRedo, onSave, onPreview, onProfile, onShare, onLogin, teaser } = props;

  /**
   * Handle the click event for the login button (teaser mode).
   */
  const handleLoginClick = () => {
    if (onLogin) return onLogin();
    window.location.href = "https://vi-up.com/login";
  };

  /**
   * Handle the click event for the undo button
   */
  const handleUndoClick = () => {
    if (onUndo) return onUndo();
    console.log('Undo action triggered');
  };

  /**
   * Handle the click event for the redo button
   */
  const handleRedoClick = () => {
    if (onRedo) return onRedo();
    console.log('Redo action triggered');
  };

  /**
   * Handle the click event for the save button
   */
  const handleSaveClick = () => {
    if (onSave) return onSave();
    console.log('Save action triggered');
  };

  /**
   * "Live" preview: publish (blob + iFastNet sync, exactly like Share Link) and
   * open the hosted page. The menu stays open and the item disabled while that
   * runs so a second click cannot start a duplicate publish; the handler reports
   * its own failures (toast), after which the item is clickable again.
   */
  const handlePreviewLive = async (): Promise<void> => {
    if (previewStatus !== "idle") return;
    if (!onPreview) {
      setPreviewOpen(false);
      console.log('Preview (live) action triggered');
      return;
    }
    setPreviewStatus("live");
    try {
      await onPreview();
      setPreviewOpen(false);
    } finally {
      setPreviewStatus("idle");
    }
  };

  /**
   * "Local" preview: render the invitation in-place without uploading.
   */
  const handlePreviewLocal = () => {
    setPreviewOpen(false);
    if (props.onPreviewLocal) return props.onPreviewLocal();
    console.log('Preview (local) action triggered');
  };

  // Opens the package upgrade modal (Stripe checkout — see PaymentUpgradeModal).
  // No-op when no handler is wired (legacy/teaser).
  const handleUpgradeClick = () => {
    if (props.onUpgrade) return props.onUpgrade();
    console.log('Upgrade action triggered');
  };

  /**
   * Handle the click event for the profile button
   */
  const handleProfileClick = () => {
    if (onProfile) return onProfile();
    console.log('Profile action triggered');
  };

  // ── Page actions (phone ⋮ menu) ──────────────────────────────────────────
  // The same editor handle the desktop page bar drives; the gesture on the
  // canvas edges adds pages the same way.
  const pageCount = props.pageCount ?? 1;
  const currentPageIndex = props.currentPageIndex ?? 0;

  const closeMoreMenu = () => {
    setMoreOpen(false);
    setDeleteArmed(false);
  };

  const handleAddPage = () => {
    editorRef.current?.addPage?.();
    closeMoreMenu();
  };

  const handleDeletePage = () => {
    // First tap arms, second deletes — removePage is told to skip its own
    // native confirm because this menu already asked.
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    editorRef.current?.removePage?.({ skipConfirm: true });
    closeMoreMenu();
  };

  // Share Link publishes to events/event-{eventId}.json, so it needs a canvas
  // that is bound to an event; eventSlug returns null for anything else (see
  // src/lib/slug.ts). The item disables itself in that case rather than firing
  // a publish that can only fail. Share PDF has no such requirement.
  const canPublishLink = !!eventSlug(props.eventId);

  /**
   * Handle the click event for the share button.
   * Opens the share dropdown (or defers to the onShare prop if provided).
   *
   * The dropdown used to be designer-only; it is now available in every mode
   * and on every path, so Share PDF is reachable from any canvas.
   */
  const handleShareClick = (): void => {
    if (onShare) return onShare();
    setShareOpen((o) => !o);
  };

  /**
   * Copy text to the clipboard. `navigator.clipboard` only exists in secure
   * contexts (https/localhost) — the editor is often served over plain http on
   * the LAN, so fall back to a hidden textarea + execCommand there.
   */
  const copyText = async (text: string): Promise<void> => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  };

  /**
   * "Share Link" — publish + sync (publishAndSyncCanvas, the same helper Live
   * Preview uses), then copy the customer-facing vi-up.com URL that iFastNet
   * returned. The internal https://canvas.vi-up.com/e/{canvas_slug} address is
   * never copied: it is only the iframe source inside that page.
   *
   * A blob failure skips the sync entirely, so PHP is never told about a canvas
   * that was not published. A sync failure leaves the published blob in place
   * and copies NOTHING — clicking Share Link again re-runs both steps, which is
   * safe because each overwrites in place.
   */
  const handleShareLink = async (): Promise<void> => {
    const editor = editorRef.current;
    // The guard is what prevents a double click from publishing twice: any
    // status other than "idle" means a share is already in flight or just
    // finished (the button is also disabled for the same window).
    if (!editor || shareStatus !== "idle") return;
    // Belt-and-braces: the item is disabled without an event, but never start a
    // publish that has nowhere to write.
    if (!canPublishLink) return;
    setShareError("");
    setShareStatus("link");
    try {
      // Land any pending rename in PHP first, so the copied link carries the
      // title currently on screen rather than the last debounced one.
      await props.onFlushTitle?.();
      const { publicShareUrl } = await publishAndSyncCanvas(editor, eventName, {
        userId: props.userId,
        eventId: props.eventId,
        designId: props.designId,
        packageId: props.packageId,
      });

      // Both steps succeeded — copy the link iFastNet returned, verbatim.
      await copyText(publicShareUrl);
      setShareStatus("copied");
      setTimeout(() => {
        setShareStatus("idle");
        setShareOpen(false);
      }, 1500);
    } catch (e) {
      console.error("[share] link failed", e);
      setShareError((e as Error).message || "Could not create the share link.");
      setShareStatus("idle");
    }
  };

  /**
   * "Share PDF": open the export panel. It renders the pages, previews the
   * sheet the user is about to get and owns the download itself, so nothing is
   * written to disk until they press Download there.
   */
  const handleSharePDF = (): void => {
    if (!editorRef.current || shareStatus !== "idle") return;
    setShareOpen(false);
    setPdfOpen(true);
  };

  return (
    <header className="relative shrink-0 grid grid-cols-[auto_minmax(0,1fr)_auto] pc:grid-cols-[1fr_auto_1fr] h-[54px] pc:h-[78px] lg:h-[111px] w-full items-center gap-1 pc:gap-4 bg-[#EDE2DE] px-2 py-0 pc:px-4 pc:py-0 lg:p-0">
      <div className="flex items-center justify-start lg:pl-[106px] gap-0.5 pc:gap-0">
        {teaser || !canGoHome ? (
          // Teaser mode, or any route other than /designer: the logo is
          // decorative only — no link back to the homepage filing system.
          <div className="flex items-center justify-center gap-4 my-9 mr-[20px] hidden pc:flex">
            <img src="/Vi-Up Submark.png" alt="Vi-Up" className="h-[30px] w-[30px]" />
          </div>
        ) : (
          <a href={resolvedHomeHref} className="flex items-center justify-center gap-4 my-9 mr-[20px] hidden pc:flex">
            <img src="/Vi-Up Submark.png" alt="Vi-Up" className="h-[30px] w-[30px]" />
          </a>
        )}

        {/* Hamburger Menu - Mobile Only */}
        <button className="pc:hidden p-1.5 hover:bg-[#D4C9C4] rounded-lg transition-colors">
          <svg className="w-5 h-5 text-[#7D5B59]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-4 lg:gap-[35px] hidden pc:flex">
          <button onClick={handleUndoClick}>
            <img src="/Undo.svg" alt="Undo" className="w-[23px] h-[23px]" />
          </button>

          <button onClick={handleRedoClick}>
            <img src="/Redo.svg" alt="Redo" className="w-[23px] h-[23px]" />
          </button>
        </div>

        {/* Mobile Undo/Redo */}
        <div className="flex items-center gap-0.5 pc:hidden">
          <button onClick={handleUndoClick} className="p-1.5 hover:bg-[#D4C9C4] rounded-lg transition-colors">
            <img src="/Undo.svg" alt="Undo" className="w-[18px] h-[18px]" />
          </button>

          <button onClick={handleRedoClick} className="p-1.5 hover:bg-[#D4C9C4] rounded-lg transition-colors">
            <img src="/Redo.svg" alt="Redo" className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      <div className="hidden pc:flex items-center justify-center gap-[5px] lg:-translate-x-[105px]">
        <input
          type="text"
          value={eventName}
          onChange={(event) => setEventName(event.target.value)}
          readOnly={titleReadOnly}
          title={titleReadOnly ? "Only the event owner can rename this event" : undefined}
          className={`font-bold text-[15px] lg:text-[18px] text-right bg-transparent border-none outline-none w-[110px] lg:w-[140px] ${
            titleReadOnly ? "cursor-default select-none" : ""
          }`}
          aria-label="Event name"
        />

        <button onClick={handleSaveClick} className="rounded-full text-white flex items-center justify-center">
          <img
            src="/cloud-save.svg"
            className="h-[23px] w-[33px] transition-[filter] duration-200"
            // The SVG has a fixed brown fill, so recolor via filter: normalise to
            // black, then tint green while the post-save flash is active.
            style={
              cloudFlashGreen
                ? {
                    filter:
                      "brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(474%) hue-rotate(84deg) brightness(96%) contrast(88%)",
                  }
                : undefined
            }
          />
        </button>
      </div>

      {/* Mobile Event Name (compact) */}
      <div className="flex pc:hidden items-center justify-center gap-1 min-w-0">
        <input
          type="text"
          value={eventName}
          onChange={(event) => setEventName(event.target.value)}
          readOnly={titleReadOnly}
          title={titleReadOnly ? "Only the event owner can rename this event" : undefined}
          className={`font-bold text-[14px] text-center text-[#7D5B59] bg-transparent border-none outline-none min-w-0 w-full max-w-[150px] truncate ${
            titleReadOnly ? "cursor-default select-none" : ""
          }`}
          aria-label="Event name"
        />
        <button onClick={handleSaveClick} className="p-1.5 shrink-0 hover:bg-[#D4C9C4] rounded-lg transition-colors">
          <img
            src="/cloud-save.svg"
            className="h-[18px] w-[24px] transition-[filter] duration-200"
            style={
              cloudFlashGreen
                ? {
                    filter:
                      "brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(474%) hue-rotate(84deg) brightness(96%) contrast(88%)",
                  }
                : undefined
            }
          />
        </button>
      </div>

      <div className="hidden pc:flex items-center justify-end gap-2 lg:gap-4 mr-0 lg:mr-[130px]">
        <div className="relative" ref={previewRef}>
          <button
            onClick={() => setPreviewOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={previewOpen}
            title="Preview"
            className=" rounded-full text-white p-2"
          >
            <img src="/preview.svg" alt="Preview" className="h-[34px] w-[34px] lg:h-[45px] lg:w-[45px]" />
          </button>

          {/* Preview dropdown: Live vs Local */}
          <nav
            role="menu"
            className={[
              "absolute right-0 top-[calc(100%+8px)] min-w-[271px] bg-white rounded-[25px]",
              "shadow-[0_10px_30px_rgba(0,0,0,0.12)] p-[10px] z-[1000]",
              "transition-all duration-150 ease-in-out",
              previewOpen
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 -translate-y-1.5 pointer-events-none",
            ].join(" ")}
          >
            {/* Live preview */}
            <button
              type="button"
              role="menuitem"
              // Disabled for the whole publish → sync cycle (same guard as Share
              // Link) so one click can never trigger two publishes.
              disabled={previewStatus === "live"}
              onClick={handlePreviewLive}
              className="w-full flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] hover:bg-[#f7f2f1] disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              {previewStatus === "live" ? (
                <Loader2 className="w-[22px] flex-shrink-0 animate-spin" />
              ) : (
                <Link2 className="w-[22px] flex-shrink-0" />
              )}
              <span className="flex flex-col items-start min-w-0">
                <span>{previewStatus === "live" ? "Publishing…" : "Live Preview"}</span>
                <span className="text-[12px] font-normal text-[#7D5B59]/60">
                  Publish and open the hosted page
                </span>
              </span>
            </button>

            {/* Local preview */}
            <button
              type="button"
              role="menuitem"
              onClick={handlePreviewLocal}
              className="w-full flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] hover:bg-[#f7f2f1] text-left"
            >
              <FileText className="w-[22px] flex-shrink-0" />
              <span className="flex flex-col items-start min-w-0">
                <span>Local Preview</span>
                <span className="text-[12px] font-normal text-[#7D5B59]/60">
                  Preview in-place without uploading
                </span>
              </span>
            </button>
          </nav>
        </div>

        {/* Upgrade Package — opens the dummy-checkout modal. Only shown when a
            handler is wired (event-bound editor), never for teaser/legacy. */}
        {props.onUpgrade && (
          <button
            onClick={handleUpgradeClick}
            className="border-3 border-[#7D5B59] text-[#7D5B59] rounded-[100px] px-3 lg:px-[22px] py-2 lg:py-[12px] flex items-center gap-2 h-[36px] lg:h-[45px] text-[13px] lg:text-[18px] font-bold whitespace-nowrap hover:bg-[#7D5B59]/5"
          >
            {/* Teaser keeps the gift icon on every viewport (incl. laptop/PC);
                elsewhere it only shows on smaller screens. */}
            <Gift className={teaser ? "w-5" : "w-5 lg:hidden"} /> <span className="hidden lg:inline">Upgrade Package</span>
          </button>
        )}

        {teaser ? (
          <button onClick={handleLoginClick} className="bg-[#5a2d2d] text-white px-3 lg:px-[22px] py-2 lg:py-[12px] rounded-[100px] flex items-center gap-2 h-[36px] lg:h-[45px] text-[13px] lg:text-[18px] font-bold whitespace-nowrap">
            <LogIn className="w-5 lg:hidden" />
            <span className="hidden lg:inline">Login</span>
          </button>
        ) : (
          <div className="relative" ref={shareRef}>
            <button
              onClick={handleShareClick}
              aria-haspopup="true"
              aria-expanded={shareOpen}
              className="bg-[#5a2d2d] text-white px-3 lg:px-[22px] py-2 lg:py-[12px] rounded-[100px] flex items-center gap-2 h-[36px] lg:h-[45px] text-[13px] lg:text-[18px] font-bold whitespace-nowrap"
            >
              <Upload className="w-5 lg:hidden" />
              <span className="hidden lg:inline">Share</span>
            </button>

            {/* Share dropdown */}
            <nav
              role="menu"
              className={[
                "absolute right-0 top-[calc(100%+8px)] min-w-[271px] bg-white rounded-[25px]",
                "shadow-[0_10px_30px_rgba(0,0,0,0.12)] p-[10px] z-[1000]",
                "transition-all duration-150 ease-in-out",
                shareOpen
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 -translate-y-1.5 pointer-events-none",
              ].join(" ")}
            >
              {/* Share Link */}
              <button
                type="button"
                role="menuitem"
                // Disabled for the whole publish → sync → copy cycle so a second
                // click cannot start a duplicate publish.
                disabled={shareStatus !== "idle" || !canPublishLink}
                onClick={handleShareLink}
                className="w-full flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] hover:bg-[#f7f2f1] disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                {shareStatus === "link" ? (
                  <Loader2 className="w-[22px] flex-shrink-0 animate-spin" />
                ) : shareStatus === "copied" ? (
                  <Check className="w-[22px] flex-shrink-0 text-green-600" />
                ) : (
                  <Link2 className="w-[22px] flex-shrink-0" />
                )}
                <span className="flex flex-col items-start min-w-0">
                  <span>
                    {shareStatus === "link"
                      ? "Creating link…"
                      : shareStatus === "copied"
                      ? "Link copied!"
                      : "Share Link"}
                  </span>
                  <span className="text-[12px] font-normal text-[#7D5B59]/60 truncate max-w-[190px]">
                    {canPublishLink ? eventName : "Open from My Event to publish"}
                  </span>
                </span>
              </button>

              {/* Share Link failure — the link was NOT copied. Both steps are
                  idempotent, so clicking Share Link again is a safe retry. */}
              {shareError && (
                <p
                  role="alert"
                  className="mx-3 mb-1 rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[12px] font-semibold text-[#B23B3B]"
                >
                  {shareError} Please try again.
                </p>
              )}

              {/* Share PDF */}
              <button
                type="button"
                role="menuitem"
                disabled={shareStatus === "link" || shareStatus === "copied"}
                onClick={handleSharePDF}
                className="w-full flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] hover:bg-[#f7f2f1] disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <FileText className="w-[22px] flex-shrink-0" />
                <span className="flex flex-col items-start min-w-0">
                  <span>Share PDF</span>
                  <span className="text-[12px] font-normal text-[#7D5B59]/60">
                    Preview and adjust, then download
                  </span>
                </span>
              </button>
            </nav>
          </div>
        )}

        {/* ── User Profile Dropdown (hidden in teaser mode) ───────────── */}
        {/* No login data → Login button (matches the Share button styling). */}
        {!teaser && user === null && (
          <button
            onClick={handleLoginClick}
            className="bg-[#5a2d2d] text-white px-3 lg:px-[22px] py-2 lg:py-[12px] rounded-[100px] flex items-center gap-2 h-[36px] lg:h-[45px] text-[13px] lg:text-[18px] font-bold whitespace-nowrap"
          >
            <LogIn className="w-5 lg:hidden" />
            <span className="hidden lg:inline">Login</span>
          </button>
        )}

        {!teaser && user && (
        <div className="relative" ref={profileRef}>
 
          {/* Trigger: profile image */}
          <button
            className="flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#7D5B59] focus-visible:rounded-xl"
            aria-haspopup="true"
            aria-expanded={profileOpen}
            onClick={() => {
              setProfileOpen((o) => !o);
              handleProfileClick(); // still fires the onProfile prop if provided
            }}
          >
            <img
              src={imgSrc}
              alt="Profile Picture"
              className="w-[40px] h-[40px] rounded-full object-cover"
            />
          </button>
 
          {/* Dropdown panel — visible on hover (group-hover) OR click (profileOpen) */}
          <nav
            role="menu"
            className={[
              "absolute right-0 top-[calc(100%+8px)] min-w-[271px] bg-white rounded-[25px]",
              "shadow-[0_10px_30px_rgba(0,0,0,0.12)] p-[10px] z-[1000]",
              "transition-all duration-150 ease-in-out",
              profileOpen
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 -translate-y-1.5 pointer-events-none",
            ].join(" ")}
          >
            {/* Header row: avatar + username + email */}
            <div className="flex items-center gap-[4.5px] px-3 py-2">
              <img
                src={imgSrc}
                alt="Profile Picture"
                className="w-[40px] h-[40px] rounded-full object-cover"
              />
              <div className="min-w-0">
                <span className="block text-[#7D5B59] font-bold text-[20px] font-[Montserrat] truncate">
                  {username}
                </span>
                <span className="block text-[#7D5B5999] text-[13px] truncate">
                  {user?.email}
                </span>
              </div>
            </div>
 
            {/* My Account */}
            <a
              href="https://vi-up.com/User-Account"
              role="menuitem"
              className="flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] no-underline hover:bg-[#f7f2f1]"
              onClick={() => setProfileOpen(false)}
            >
              <svg className="w-[25px] fill-current flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14Z" />
              </svg>
              <span>My Account</span>
            </a>
 
            {/* My Events */}
            <a
              href="https://vi-up.com/MyEvent"
              role="menuitem"
              className="flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] no-underline hover:bg-[#f7f2f1]"
              onClick={() => setProfileOpen(false)}
            >
              <svg className="w-[25px] fill-current flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 2v2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2Zm12 8H5v8h14Z" />
              </svg>
              <span>My Events</span>
            </a>
 
            {/* Logout — clears the local session, then bounces to the vi-up.com login. */}
            <button
              role="menuitem"
              onClick={() => {
                clearCanvasUser();
                setProfileOpen(false);
                window.location.href = "https://vi-up.com/login";
              }}
              className="w-full flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] no-underline hover:bg-[#f7f2f1] bg-transparent border-0 cursor-pointer text-left"
            >
              <i className="fa fa-sign-out" aria-hidden="true" style={{ fontSize: 19 }} />
              <span>Logout</span>
            </button>
          </nav>
        </div>
        )}
        {/* ─────────────────────────────────────────────────────────────── */}
      </div>

      {/* Mobile Right Section */}
      <div className="flex pc:hidden items-center justify-end gap-0.5">
        <button
          onClick={() => setPreviewOpen((o) => !o)}
          className="p-1.5 hover:bg-[#D4C9C4] rounded-lg transition-colors"
          title="Preview"
        >
          <img src="/preview.svg" alt="Preview" className="h-5 w-5" />
        </button>

        {/* More Options Menu — the phone's page controls live here. */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => {
              setMoreOpen((o) => !o);
              setDeleteArmed(false);
            }}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="More options"
            className="p-1.5 hover:bg-[#D4C9C4] rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-[#7D5B59]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>

          {moreOpen && (
            <nav
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] min-w-[220px] bg-white rounded-[15px] shadow-lg p-2 z-[1000]"
            >
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[#7D5B59]/60">
                Page {currentPageIndex + 1} of {pageCount}
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={handleAddPage}
                className="w-full flex items-center gap-2 px-3 py-2 text-[#7D5B59] font-semibold rounded-[10px] hover:bg-[#f7f2f1] text-left text-sm"
              >
                <Plus className="w-4 flex-shrink-0" />
                <span>Add Page</span>
              </button>

              {/* Disabled for the envelope page (permanent) and for the last
                  remaining page — both are refused by the editor anyway. */}
              {(() => {
                const canDelete = editorRef.current?.canDeleteCurrentPage?.() ?? false;
                return (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canDelete}
                    onClick={handleDeletePage}
                    title={
                      canDelete
                        ? undefined
                        : pageCount <= 1
                        ? "The last page cannot be deleted"
                        : "The envelope page cannot be deleted"
                    }
                    className={`w-full flex items-center gap-2 px-3 py-2 font-semibold rounded-[10px] text-left text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                      deleteArmed
                        ? "bg-[#FDECEC] text-[#B23B3B]"
                        : "text-[#B23B3B] hover:bg-[#FDECEC]"
                    }`}
                  >
                    {deleteArmed ? (
                      <AlertTriangle className="w-4 flex-shrink-0" />
                    ) : (
                      <Trash2 className="w-4 flex-shrink-0" />
                    )}
                    <span>
                      {deleteArmed
                        ? `Tap again to delete page ${currentPageIndex + 1}`
                        : "Delete Page"}
                    </span>
                  </button>
                );
              })()}
            </nav>
          )}
        </div>
      </div>

      {/* Mobile Preview Dropdown */}
      {previewOpen && (
        <nav className="pc:hidden absolute right-2 top-[calc(100%+8px)] min-w-[200px] bg-white rounded-[15px] shadow-lg p-2 z-[1000]">
          <button
            type="button"
            role="menuitem"
            disabled={previewStatus === "live"}
            onClick={handlePreviewLive}
            className="w-full flex items-center gap-2 px-3 py-2 text-[#7D5B59] font-semibold rounded-[10px] hover:bg-[#f7f2f1] disabled:opacity-40 disabled:cursor-not-allowed text-left text-sm"
          >
            {previewStatus === "live" ? (
              <Loader2 className="w-4 flex-shrink-0 animate-spin" />
            ) : (
              <Link2 className="w-4 flex-shrink-0" />
            )}
            <span>{previewStatus === "live" ? "Publishing…" : "Live Preview"}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handlePreviewLocal}
            className="w-full flex items-center gap-2 px-3 py-2 text-[#7D5B59] font-semibold rounded-[10px] hover:bg-[#f7f2f1] text-left text-sm"
          >
            <FileText className="w-4 flex-shrink-0" />
            <span>Local Preview</span>
          </button>
        </nav>
      )}

      {/* PDF export panel — preview + paper/fit/margin/page options. */}
      {pdfOpen && (
        <PdfExportModal
          editorRef={editorRef}
          eventName={eventName}
          onClose={() => setPdfOpen(false)}
        />
      )}
    </header>
  );
}