//what does this code do

'use client';

import { Upload, LogIn, Link2, FileText, Check, Loader2, AlertCircle, Gift } from 'lucide-react';
import { RefObject, useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation"; // ✅ ADD THIS
import { EditorHandle } from "@/src/components/CanvasEditor";
import {
  getCanvasUser,
  clearCanvasUser,
  avatarFor,
  type CanvasUser,
} from "@/src/lib/userSession";
import { liveEventUrl } from "@/src/lib/slug";

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
  onPreview?: () => void;
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
  const [shareStatus, setShareStatus] = useState<"idle" | "link" | "copied" | "pdf">("idle");

  // ── PREVIEW DROPDOWN ─────────────────────────────────────────────────────
  // The preview button opens a menu: "Live" publishes/uploads then opens the
  // hosted /e/{slug} page; "Local" previews in-place without uploading.
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

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
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const [localEventName, setLocalEventName] = useState("Bride & Groom");
  const eventName = props.eventName ?? localEventName;
  const setEventName = (name: string) => {
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
   * "Live" preview: publish/upload the pages and open the hosted page.
   */
  const handlePreviewLive = () => {
    setPreviewOpen(false);
    if (onPreview) return onPreview();
    console.log('Preview (live) action triggered');
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

  /**
   * Handle the click event for the share button.
   * Opens the share dropdown (or defers to the onShare prop if provided).
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
   * "Share Link": publish the project exactly like the play (preview) button
   * does — exportHTML uploads the pages and returns a slug derived from the
   * event name — then copy the resulting /e/{slug} URL to the clipboard.
   */
  const handleShareLink = async (): Promise<void> => {
    const editor = editorRef.current;
    if (!editor || shareStatus !== "idle") return;
    setShareStatus("link");
    try {
      // exportHTML publishes the pages and returns the title-derived slug; build
      // the canonical public link so the copied URL is always the real live
      // format (https://canvas.vi-up.com/e/{slug}), not the editor's own origin.
      const slug = await editor.exportHTML(eventName);
      const shareUrl = liveEventUrl(slug);
      await copyText(shareUrl);
      setShareStatus("copied");
      setTimeout(() => {
        setShareStatus("idle");
        setShareOpen(false);
      }, 1500);
    } catch (e) {
      console.error("[share] link failed", e);
      alert("Could not create the share link: " + (e as Error).message);
      setShareStatus("idle");
    }
  };

  /**
   * "Share PDF": render every page of the invitation to an image and download
   * them as a single PDF named after the event.
   */
  const handleSharePDF = async (): Promise<void> => {
    const editor = editorRef.current;
    if (!editor || shareStatus !== "idle") return;
    setShareStatus("pdf");
    try {
      await editor.exportPDF(eventName);
      setShareOpen(false);
    } catch (e) {
      console.error("[share] pdf failed", e);
      alert("Could not export the PDF: " + (e as Error).message);
    } finally {
      setShareStatus("idle");
    }
  };

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] h-[111px] w-full items-center gap-4 bg-[#EDE2DE]">
      <div className="flex items-center justify-start pl-[106px]">
        {teaser || !canGoHome ? (
          // Teaser mode, or any route other than /designer: the logo is
          // decorative only — no link back to the homepage filing system.
          <div className="flex items-center justify-center gap-4 my-9 mr-[20px]">
            <img src="/Vi-Up Submark.png" alt="Vi-Up" className="h-[40px] w-[40px]" />
          </div>
        ) : (
          <a href={resolvedHomeHref} className="flex items-center justify-center gap-4 my-9 mr-[20px] ">
            <img src="/Vi-Up Submark.png" alt="Vi-Up" className="h-[40px] w-[40px]" />
          </a>
        )}



        <div className="flex items-center gap-[35px]">
          <button onClick={handleUndoClick}>
            <img src="/Undo.svg" alt="Undo" className="w-[23px] h-[23px]" />
          </button>

          <button onClick={handleRedoClick}>
            <img src="/Redo.svg" alt="Redo" className="w-[23px] h-[23px]" />
          </button>
        </div>

       
      </div>

      <div className="flex items-center justify-center gap-2 -translate-x-[105px]">
        <input
          type="text"
          value={eventName}
          onChange={(event) => setEventName(event.target.value)}
          className="font-bold text-[18px] text-right bg-transparent border-none outline-none w-[140px]"
          aria-label="Event name"
        />

        {/* Title autosync status — saving / saved / failed (event-bound canvases). */}
        <span className="flex w-4 items-center justify-center" aria-live="polite">
          {props.titleSyncStatus === "saving" && (
            <Loader2 className="w-4 h-4 animate-spin text-[#7D5B59]" aria-label="Saving title" />
          )}
          {props.titleSyncStatus === "saved" && (
            <Check className="w-4 h-4 text-green-600" aria-label="Title saved" />
          )}
          {props.titleSyncStatus === "error" && (
            <AlertCircle
              className="w-4 h-4 text-[#B23B3B]"
              aria-label={props.titleSyncError || "Title sync failed"}
            />
          )}
        </span>

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

      <div className="flex items-center justify-end gap-4 mr-[130px]">
        <div className="relative" ref={previewRef}>
          <button
            onClick={() => setPreviewOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={previewOpen}
            title="Preview"
            className=" rounded-full text-white p-2"
          >
            <img src="/preview.svg" alt="Preview" className="h-[45px] w-[45px]" />
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
              onClick={handlePreviewLive}
              className="w-full flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] hover:bg-[#f7f2f1] text-left"
            >
              <Link2 className="w-[22px] flex-shrink-0" />
              <span className="flex flex-col items-start min-w-0">
                <span>Live Preview</span>
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
            className="border-3 border-[#7D5B59] text-[#7D5B59] rounded-[100px] px-[22px] py-[12px] flex items-center gap-2 h-[45px] text-[18px] font-bold hover:bg-[#7D5B59]/5"
          >
            <Gift className="w-5" /> Upgrade Package
          </button>
        )}

        {teaser ? (
          <button onClick={handleLoginClick} className="bg-[#5a2d2d] text-white px-[22px] py-[12px] rounded-[100px] flex items-center gap-2 h-[45px] text-[18px] font-bold">
            <LogIn className="w-5" />
            Login
          </button>
        ) : (
          <div className="relative" ref={shareRef}>
            <button
              onClick={handleShareClick}
              aria-haspopup="true"
              aria-expanded={shareOpen}
              className="bg-[#5a2d2d] text-white px-[22px] py-[12px] rounded-[100px] flex items-center gap-2 h-[45px] text-[18px] font-bold"
            >
              <Upload className="w-5" />
              Share
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
                disabled={shareStatus === "pdf"}
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
                    {eventName}
                  </span>
                </span>
              </button>

              {/* Share PDF */}
              <button
                type="button"
                role="menuitem"
                disabled={shareStatus === "link" || shareStatus === "copied"}
                onClick={handleSharePDF}
                className="w-full flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] hover:bg-[#f7f2f1] disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                {shareStatus === "pdf" ? (
                  <Loader2 className="w-[22px] flex-shrink-0 animate-spin" />
                ) : (
                  <FileText className="w-[22px] flex-shrink-0" />
                )}
                <span className="flex flex-col items-start min-w-0">
                  <span>{shareStatus === "pdf" ? "Exporting PDF…" : "Share PDF"}</span>
                  <span className="text-[12px] font-normal text-[#7D5B59]/60">
                    Download all pages as PDF
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
            className="bg-[#5a2d2d] text-white px-[22px] py-[12px] rounded-[100px] flex items-center gap-2 h-[45px] text-[18px] font-bold"
          >
            <LogIn className="w-5" />
            Login
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
    </header>
  );
}