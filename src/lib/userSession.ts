// Lightweight user-session store (pre-database).
//
// The login flow lives on vi-up.com (PHP/iFastNet). After a successful login it
// redirects to this canvas app at /<userId> (e.g. https://canvas.vi-up.com/144).
// The dynamic route at app/[userId]/page.tsx fetches the user from the vi-up API
// and stashes it here so the rest of the app (header dropdown, etc.) can read it.
//
// Storage layout (localStorage):
//   viup_canvas_user -> CanvasUser

export type CanvasUser = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  is_admin?: number;
  profile_pic?: string | null;
  avatar_url?: string | null;
};

export const USER_KEY = "viup_canvas_user";
const DEFAULT_AVATAR = "https://vi-up.com/uploads/users/default.png";

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

export function getCanvasUser(): CanvasUser | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as CanvasUser) : null;
  } catch {
    return null;
  }
}

export function setCanvasUser(user: CanvasUser) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error("[userSession] failed to write user", e);
  }
}

export function clearCanvasUser() {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(USER_KEY);
  } catch (e) {
    console.error("[userSession] failed to clear user", e);
  }
}

// Best avatar URL we can show, with a sensible fallback.
export function avatarFor(user: CanvasUser | null): string {
  return user?.avatar_url || user?.profile_pic || DEFAULT_AVATAR;
}
