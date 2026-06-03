"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { setCanvasUser, avatarFor, type CanvasUser } from "@/src/lib/userSession";

// Login-landing route. vi-up.com handles login (PHP/iFastNet) and redirects here
// as /<userId> (e.g. https://canvas.vi-up.com/144). We fetch the user from the
// vi-up API, store the session in localStorage (viup_canvas_user), then drop the
// user into the project gallery at "/". The gallery header reads the session and
// shows it in the profile dropdown (see components/UserMenu.tsx).
const API_BASE = "https://vi-up.com/api";

export default function CanvasUserPage() {
  const params = useParams();
  const router = useRouter();
  const raw = params?.userId;
  const userId = Array.isArray(raw) ? raw[0] : raw;

  const [user, setUser] = useState<CanvasUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function loadUser() {
      try {
        const response = await fetch(
          `${API_BASE}/get_user.php?user_id=${encodeURIComponent(userId as string)}`
        );
        const data = await response.json();

        if (cancelled) return;

        if (data.success && data.user) {
          setUser(data.user as CanvasUser);
          setCanvasUser(data.user as CanvasUser);
          // Hand the user off to the existing app (project gallery). replace()
          // keeps /<userId> out of history so Back doesn't re-trigger the fetch.
          router.replace("/");
        } else {
          setError(data.message || "User not found.");
        }
      } catch (err) {
        console.error("Failed to fetch user:", err);
        if (!cancelled) setError("Could not reach the server. Please try again.");
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-cream text-brand-dark">
        <div className="h-10 w-10 rounded-full border-2 border-[#D9C7C2] border-t-[#5a2d2d] animate-spin" />
        <p className="mt-4 text-[14px] text-[#7D5B59]">Loading your account…</p>
      </div>
    );
  }

  // ── Error / not found ────────────────────────────────────────────────────────
  if (error || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-cream text-brand-dark px-6 text-center">
        <h1 className="text-[18px] font-bold text-[#7D5B59]">User not found</h1>
        <p className="mt-1 text-[14px] text-[#7D5B5999]">
          {error || "Please log in again."}
        </p>
        <a
          href="https://vi-up.com/login"
          className="mt-5 inline-flex items-center gap-2 bg-[#5a2d2d] text-white px-5 py-2.5 rounded-full text-[15px] font-bold hover:opacity-90 transition"
        >
          Back to login
        </a>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  // We redirect to "/" above; this brief view shows while the navigation settles.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-cream text-brand-dark">
      <div className="flex items-center gap-3">
        <img
          src={avatarFor(user)}
          alt={user.name}
          className="h-10 w-10 rounded-full object-cover"
        />
        <div>
          <p className="font-semibold text-[#191212]">{user.name}</p>
          <p className="text-sm text-[#7D5B5999]">{user.email}</p>
        </div>
      </div>
      <p className="mt-4 text-[14px] text-[#7D5B59]">Opening your projects…</p>
    </div>
  );
}
