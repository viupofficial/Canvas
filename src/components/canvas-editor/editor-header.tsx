//what does this code do

'use client';

import { Gift, Upload } from 'lucide-react';
import { RefObject, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation"; // ✅ ADD THIS
import { EditorHandle } from "@/src/components/CanvasEditor";

const SHARE_BASE_URL = "http://192.168.56.1:3000/preview";
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
  eventName?: string;
  onEventNameChange?: (name: string) => void;
}) {
  const router = useRouter();

  // ── PROFILE DROPDOWN ─────────────────────────────────────────────────────
  // MIGRATION: Replace this mock with real NextAuth data:
  //   import { useSession, signOut } from "next-auth/react";
  //   const { data: session } = useSession();
  //   const username = session?.user?.name ?? "";
  //   const imgSrc   = session?.user?.image ?? "/placeholder_user.png";
  const username = "Username";                   // ← swap with session.user.name
  const imgSrc   = "/placeholder_user2.png";      // ← swap with session.user.image

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef  = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
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

  const { editorRef, onUndo, onRedo, onSave, onPreview, onUpgrade, onProfile, onShare } = props;

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
   * Handle the click event for the preview button
   */
  const handlePreviewClick = () => {
    if (onPreview) return onPreview();
    console.log('Preview action triggered');
  };

  /**
   * Handle the click event for the upgrade button
   */
  const handleUpgradeClick = () => {
    if (onUpgrade) return onUpgrade();
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
   * Handle the click event for the share button
   * @description This function will open a new tab with
   *  the share URL and a message to share with the user's
   *  friends on WhatsApp.
   * @param {void} none
   * @returns {void}
   */
  const handleShareClick = (): void => {
    if (onShare) return onShare();

    const shareUrl = SHARE_BASE_URL;
  
    const message = `${eventName} invited you \n\nTap here:\n${shareUrl}`;
    const encodedMessage = encodeURIComponent(message);
  
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
  
    /**
     * Open the WhatsApp share URL in a new tab
     */
    window.open(whatsappUrl, "_blank");
  };

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] h-[115px] w-full items-center gap-4 bg-[#EDE2DE]">
      <div className="flex items-center justify-start">
        <a href="/" className="flex items-center justify-center gap-4 m-10 ">
          <img src="/vi-up-header-logo.svg" alt="Vi-Up" className="h-[40px] w-[40px]" />
        </a>

        <div className="border-l-[0.5px] border-[#7D5B59] h-9 mx-1"></div>

        <div className="flex items-center gap-6">
          <button onClick={handleUndoClick}>
            <img src="/Undo.svg" alt="Undo" className="w-8" />
          </button>

          <button onClick={handleRedoClick}>
            <img src="/Redo.svg" alt="Redo" className="w-8" />
          </button>
        </div>

        <div className="border-l-[0.5px] border-[#7D5B59] h-9 mx-1"></div>
      </div>

      <input
        type="text"
        value={eventName}
        onChange={(event) => setEventName(event.target.value)}
        className="font-bold text-[18px] text-center bg-transparent border-none outline-none min-w-[180px]"
        aria-label="Event name"
      />

      <div className="flex items-center justify-end gap-4 mr-10">
        <button onClick={handleSaveClick} className=" rounded-full text-white  h-[55px] w-[55px]">
          <img src="/cloud-save.svg" className="h-[24px] w-[34px]" />
        </button>

        <button onClick={handlePreviewClick} className=" rounded-full text-white p-2">
          <img src="/preview.svg" alt="Preview" className="h-[51px] w-[51px]" />
        </button>

        {/* <button
          onClick={() => props.onPreviewLocal?.()}
          title="Preview locally (no upload)"
          className="px-3 py-1 rounded-full border border-[#7D5B59] text-[#7D5B59] text-xs font-bold hover:bg-[#7D5B59] hover:text-white transition"
        >
          Local
        </button> */}

        <button onClick={handleUpgradeClick} className="border-3 rounded-[100px] px-[22px] py-[12px] flex items-center gap-2 h-[51px] text-[18px] font-bold">
          <Gift /> Upgrade Package
        </button>

        

        <button onClick={handleShareClick} className="bg-[#5a2d2d] text-white px-[22px] py-[12px] rounded-[100px] flex items-center gap-2 h-[51px] text-[18px] font-bold">
          <Upload className="w-5" />
          Share
        </button>

        {/* ── User Profile Dropdown ───────────────────────────────────── */}
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
            {/* Header row: avatar + username */}
            <div className="flex items-center gap-[4.5px] px-3 py-2">
              <img
                src={imgSrc}
                alt="Profile Picture"
                className="w-[40px] h-[40px] rounded-full object-cover"
              />
              <span className="text-[#7D5B59] font-bold text-[20px] font-[Montserrat]">
                {username}
              </span>
            </div>
 
            {/* My Account */}
            <a
              href="/account"
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
              href="/my-events"
              role="menuitem"
              className="flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] no-underline hover:bg-[#f7f2f1]"
              onClick={() => setProfileOpen(false)}
            >
              <svg className="w-[25px] fill-current flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 2v2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2Zm12 8H5v8h14Z" />
              </svg>
              <span>My Events</span>
            </a>
 
            {/* Logout */}
            {/*
             * MIGRATION: Replace this <a> with NextAuth signOut:
             *   import { signOut } from "next-auth/react";
             *   <button onClick={() => signOut({ callbackUrl: "/" })} ...>Logout</button>
             */}
            <a
              href="/logout"
              role="menuitem"
              className="flex items-center gap-[10px] px-3 py-[10px] text-[#7D5B59] font-semibold font-[Montserrat] rounded-[10px] no-underline hover:bg-[#f7f2f1]"
              onClick={() => setProfileOpen(false)}
            >
              <i className="fa fa-sign-out" aria-hidden="true" style={{ fontSize: 19 }} />
              <span>Logout</span>
            </a>
          </nav>
        </div>
        {/* ─────────────────────────────────────────────────────────────── */}
      </div>
    </header>
  );
}