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
  // Purchased package tier. Package 1 (Basic) hides RSVP + Money Gift in the
  // canvas sidebar; any other value — including null/undefined from older API
  // builds that predate this column — shows both. See ProjectEditor.
  package_id?: number | null;
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

// Designer "Create New Project": PHP creates the events row, the user_event slug
// AND a designs row tied to the new event_id in one shot, then returns the ids,
// slug and a ready-to-open canvas_url. Designer-only (PHP also enforces role).
export type CreateProjectEventResponse = {
  success?: boolean;
  message?: string;
  event_id?: number;
  design_id?: number;
  event_slug?: string;
  title?: string;
  canvas_url?: string;
};

export async function createProjectEvent({
  userId,
  title = "Untitled",
  templateId = null,
  hasSeating = 0,
}: {
  userId: string | number;
  title?: string;
  templateId?: string | number | null;
  hasSeating?: number;
}): Promise<CreateProjectEventResponse> {
  return fetchJson<CreateProjectEventResponse>(`${API_BASE}/create_project_event.php`, {
    method: "POST",
    body: JSON.stringify({
      user_id: Number(userId),
      title,
      template_id: templateId ? Number(templateId) : null,
      has_seating: Number(hasSeating) === 1 ? 1 : 0,
    }),
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

// Event-bound deletion: removes the WHOLE project — events row, design row(s),
// rsvp + guestbook rows, the user_event slug and safe exported files — via the
// shared PHP endpoint that MyEvent also calls, keeping both in sync. Use this
// (NOT delete_design.php) whenever a design has an event_id, or the MyEvent card
// is left orphaned. Free designs (no event_id) must keep using deleteDesign.
export async function deleteProjectEvent({
  userId,
  eventId,
  designId,
}: {
  userId: string | number;
  eventId: string | number;
  designId?: string | number | null;
}): Promise<any> {
  return fetchJson(`${API_BASE}/delete_project_event.php`, {
    method: "POST",
    body: JSON.stringify({
      user_id: Number(userId),
      event_id: Number(eventId),
      design_id: designId ? Number(designId) : null,
    }),
  });
}

// ── Event title ───────────────────────────────────────────────────────────────
// Updates events.event_name (the MyEvent card title) for ONE event only:
// PHP runs WHERE event_id = ? AND user_id = ?, so BOTH ids are required. Only
// call this for an event-bound canvas (editor / designer-event) — never in free
// designer/dashboard mode where there is no event_id.
export async function updateEventTitle({
  userId,
  eventId,
  title,
}: {
  userId: string | number;
  eventId: string | number;
  title: string;
}): Promise<any> {
  return fetchJson(`${API_BASE}/update_event_title.php`, {
    method: "POST",
    body: JSON.stringify({
      user_id: Number(userId),
      event_id: Number(eventId),
      title: String(title || "").trim(),
    }),
  });
}

// Combined title sync: updates BOTH designs.name AND events.event_name in one
// call, scoped to a single user_id + event_id + design_id. This is the path the
// canvas uses to keep the MyEvent card title and the design title in lock-step.
// All four fields are required — PHP keys on user_id + event_id + design_id, so
// never call this without an event_id and design_id (e.g. free designs).
export async function syncCanvasTitle({
  userId,
  eventId,
  designId,
  title,
}: {
  userId: string | number;
  eventId: string | number;
  designId: string | number;
  title: string;
}): Promise<any> {
  return fetchJson(`${API_BASE}/sync_canvas_title.php`, {
    method: "POST",
    body: JSON.stringify({
      user_id: Number(userId),
      event_id: Number(eventId),
      design_id: Number(designId),
      title: String(title || "").trim(),
    }),
  });
}

// ── Canvas RSVP ─────────────────────────────────────────────────────────────
export async function submitCanvasRSVP({
  userId,
  eventId,
  name,
  phone,
  status,
  pax,
  packType = "",
}: {
  userId: string | number;
  eventId: string | number;
  name: string;
  phone: string;
  status: string;
  pax: number;
  packType?: string;
}): Promise<any> {
  return fetchJson(`${API_BASE}/submit_canvas_rsvp.php`, {
    method: "POST",
    body: JSON.stringify({
      user_id: Number(userId),
      event_id: Number(eventId),
      name: String(name || "").trim(),
      phone: String(phone || "").trim(),
      status,
      pax: Number(pax || 0),
      pack_type: packType || "",
      website: "",
    }),
  });
}

// ── Canvas Guestbook ────────────────────────────────────────────────────────
export async function submitCanvasGuestbook({
  userId,
  eventId,
  name,
  wish,
}: {
  userId: string | number;
  eventId: string | number;
  name: string;
  wish: string;
}): Promise<any> {
  return fetchJson(`${API_BASE}/submit_canvas_guestbook.php`, {
    method: "POST",
    body: JSON.stringify({
      user_id: Number(userId),
      event_id: Number(eventId),
      name: String(name || "").trim(),
      wish: String(wish || "").trim(),
      website: "",
    }),
  });
}

export async function getCanvasGuestbook({
  userId,
  eventId,
}: {
  userId: string | number;
  eventId: string | number;
}): Promise<any> {
  const params = new URLSearchParams();
  params.set("user_id", String(userId));
  params.set("event_id", String(eventId));
  return fetchJson(`${API_BASE}/get_canvas_guestbook.php?${params.toString()}`);
}

// ── Role guards ──────────────────────────────────────────────────────────────
// is_admin: 0 = customer, 1 = admin dashboard, 2 = editor, 3 = designer.
// Only /designer surfaces are role-gated. /editor/e access is ownership-based:
// get_user(user_id, event_id) succeeding IS the access check (PHP confirms the
// event belongs to the user). Feature power comes from event.package_id.
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
