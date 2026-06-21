// Shared client for the vi-up.com PHP APIs (iFastNet).
//
// The Vercel canvas app NEVER talks to MySQL directly — PHP is the source of
// truth for user role, event ownership, template_id, event_id and design data.
// Everything goes through these helpers so auth/role checks and JSON shapes stay
// consistent across the editor and designer routes.
//
// CORS: PHP allows the https://canvas.vi-up.com origin. Always use the
// https://vi-up.com/api/... base below — do not change the request origin.

import type { CanvasUser } from "@/src/lib/userSession";

export const API_BASE = "https://vi-up.com/api";

// ── Types mirrored from the PHP responses ────────────────────────────────────
export type ViupEvent = {
  event_id: number;
  user_id: number;
  template_id?: number | null;
  event_name?: string | null;
  design_name?: string | null;
  status?: string | null;
  event_date?: string | null;
  location?: string | null;
  canvas_name?: string | null;
};

export type ViupDesign = {
  id: number;
  user_id: number;
  event_id?: number | null;
  template_id?: number | null;
  name: string;
  json_data?: any;
  preview_url?: string | null;
  status?: string | null;
  export_path?: string | null;
  last_modified?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type GetUserResponse = {
  success?: boolean;
  message?: string;
  user?: CanvasUser;
  event?: ViupEvent | null;
};

// ── Low-level fetch wrapper ──────────────────────────────────────────────────
async function fetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid JSON response from server");
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || data?.error || "Request failed");
  }

  return data as T;
}

// ── User + event ─────────────────────────────────────────────────────────────
// When eventId is provided, PHP verifies the event belongs to the user and
// returns both `user` and `event`.
export async function getUser(
  userId: string | number,
  eventId: string | number | null = null,
): Promise<GetUserResponse> {
  const params = new URLSearchParams();
  params.set("user_id", String(userId));
  if (eventId != null && eventId !== "") params.set("event_id", String(eventId));
  return fetchJson<GetUserResponse>(`${API_BASE}/get_user.php?${params.toString()}`);
}

// ── Designs ──────────────────────────────────────────────────────────────────
export async function getDesigns(
  userId: string | number,
  eventId: string | number | null = null,
): Promise<any> {
  const params = new URLSearchParams();
  params.set("user_id", String(userId));
  if (eventId != null && eventId !== "") params.set("event_id", String(eventId));
  return fetchJson(`${API_BASE}/get_designs.php?${params.toString()}`);
}

export async function getDesign(
  userId: string | number,
  designId: string | number,
  eventId: string | number | null = null,
): Promise<any> {
  const params = new URLSearchParams();
  params.set("user_id", String(userId));
  params.set("design_id", String(designId));
  if (eventId != null && eventId !== "") params.set("event_id", String(eventId));
  return fetchJson(`${API_BASE}/get_design.php?${params.toString()}`);
}

export async function createDesign(payload: Record<string, any>): Promise<any> {
  return fetchJson(`${API_BASE}/create_design.php`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDesign(payload: Record<string, any>): Promise<any> {
  return fetchJson(`${API_BASE}/update_design.php`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteDesign(payload: Record<string, any>): Promise<any> {
  return fetchJson(`${API_BASE}/delete_design.php`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Role guards ──────────────────────────────────────────────────────────────
// is_admin: 0 = customer, 1 = admin dashboard, 2 = editor, 3 = designer.
export function canAccessEditor(user?: { is_admin?: number | string | null } | null): boolean {
  const role = Number(user?.is_admin);
  return role === 2 || role === 3;
}

export function canAccessDesigner(user?: { is_admin?: number | string | null } | null): boolean {
  return Number(user?.is_admin) === 3;
}

// Friendly name for a freshly created canvas, derived from the event.
export function getCanvasName(event?: Partial<ViupEvent> | null): string {
  return (
    event?.canvas_name ||
    event?.event_name ||
    event?.design_name ||
    "Untitled Design"
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// get_designs.php / get_design.php may return the list/record at different keys
// depending on the endpoint version — normalise both shapes here.
export function extractDesigns(res: any): ViupDesign[] {
  if (Array.isArray(res)) return res;
  return res?.designs ?? res?.data ?? [];
}

export function extractDesign(res: any): ViupDesign | null {
  return res?.design ?? (res && res.id ? res : null);
}

// PHP may hand back json_data as a string or an already-decoded object.
export function parseJsonData(jsonData: any): any {
  if (jsonData == null) return null;
  if (typeof jsonData === "string") {
    try {
      return JSON.parse(jsonData);
    } catch {
      return null;
    }
  }
  return jsonData;
}

// Coerce to a number or null — never send undefined/NaN to PHP.
export function num(value: any): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ── Load-or-create the single design tied to an event ────────────────────────
// Editor mode is locked to one event: load the existing design for the event,
// or create one (blank json_data) tied to event_id + template_id, then return
// the full record so the canvas can hydrate from it.
export async function loadOrCreateEventDesign({
  userId,
  eventId,
  event,
}: {
  userId: string | number;
  eventId: string | number;
  event?: Partial<ViupEvent> | null;
}): Promise<ViupDesign> {
  const designsRes = await getDesigns(userId, eventId);
  const designs = extractDesigns(designsRes);

  if (designs.length > 0) {
    // Prefer the most recently modified; fall back to the first item.
    const sorted = [...designs].sort((a, b) =>
      String(b.last_modified || b.updated_at || b.created_at || "").localeCompare(
        String(a.last_modified || a.updated_at || a.created_at || ""),
      ),
    );
    const chosen = sorted[0] ?? designs[0];
    // The list endpoint may omit json_data — fetch the full record if missing.
    if (chosen.json_data == null) {
      const full = extractDesign(await getDesign(userId, chosen.id, eventId));
      if (full) return full;
    }
    return chosen;
  }

  const createRes = await createDesign({
    user_id: num(userId),
    event_id: num(eventId),
    template_id: num(event?.template_id),
    name: getCanvasName(event),
    json_data: {},
  });

  const newDesignId = createRes?.design_id ?? createRes?.id;
  if (!newDesignId) throw new Error("Failed to create design");

  const full = extractDesign(await getDesign(userId, newDesignId, eventId));
  if (!full) throw new Error("Failed to load design");
  return full;
}
