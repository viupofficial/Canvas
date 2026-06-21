"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  getCanvasUser,
  clearCanvasUser,
  avatarFor,
  type CanvasUser,
} from "@/src/lib/userSession";

// Profile dropdown for the logged-in user. Reads the session that the
// /[userId] login-landing route stored in localStorage (viup_canvas_user)
// and renders the avatar / name / email dynamically.
export default function UserMenu() {
  const profileRef = useRef<HTMLDivElement | null>(null);
  // `undefined` = not yet checked (client), `null` = checked, nobody logged in.
  const [user, setUser] = useState<CanvasUser | null | undefined>(undefined);
  const [profileOpen, setProfileOpen] = useState(false);

  // Read the session on the client only (avoids hydration mismatch).
  useEffect(() => {
    setUser(getCanvasUser());
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [profileOpen]);

  // Still checking the session — render nothing to avoid a hydration flash.
  if (user === undefined) return null;

  // No login data → Login button (matches the editor Share button styling).
  if (user === null) {
    return (
      <a
        href="https://vi-up.com/login"
        className="bg-[#5a2d2d] text-white px-[22px] py-[12px] rounded-[100px] flex items-center gap-2 h-[45px] text-[18px] font-bold no-underline"
      >
        <i className="fa fa-sign-in" aria-hidden="true" style={{ fontSize: 19 }} />
        Login
      </a>
    );
  }

  const imgSrc = avatarFor(user);
  const username = user.name;

  return (
    /* ── User Profile Dropdown ───────────────────────────────────── */
    <div className="relative" ref={profileRef}>
      {/* Trigger: profile image */}
      <button
        className="flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#7D5B59] focus-visible:rounded-xl"
        aria-haspopup="true"
        aria-expanded={profileOpen}
        onClick={() => setProfileOpen((o) => !o)}
      >
        <img
          src={imgSrc}
          alt="Profile Picture"
          className="w-[40px] h-[40px] rounded-full object-cover"
        />
      </button>

      {/* Dropdown panel — visible on click (profileOpen) */}
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
              {user.email}
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
    /* ─────────────────────────────────────────────────────────────── */
  );
}
