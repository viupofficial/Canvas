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
// `userId` is ALWAYS the actor — the account currently driving the canvas —
// never the owner of the event. `actor_user_id` is sent alongside the legacy
// `user_id` so a collaborator-aware PHP build can authorize the actor and then
// resolve the canonical (owner's) design, while older builds keep reading
// `user_id` exactly as before. See checkEventAccess below.
export async function getDesigns(
  userId: string | number,
  eventId: string | number | null = null,
): Promise<any> {
  const params = new URLSearchParams();
  params.set("user_id", String(userId));
  params.set("actor_user_id", String(userId));
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
  params.set("actor_user_id", String(userId));
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

// Saves ALWAYS target the existing design_id + event_id — this endpoint never
// creates a row, so a collaborator's save updates the owner's canonical design
// rather than forking it. `user_id` in the payload is the ACTOR (the account
// doing the saving); `actor_user_id` is mirrored alongside it so a
// collaborator-aware PHP build can authorize the actor without Canvas ever
// impersonating the owner. designs.user_id / events.user_id are never sent and
// never change.
export async function updateDesign(payload: Record<string, any>): Promise<any> {
  return fetchJson(`${API_BASE}/update_design.php`, {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: payload.actor_user_id ?? payload.user_id ?? null,
      ...payload,
    }),
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

// ── Multi-client event access (ACTOR vs OWNER) ───────────────────────────────
//
// An event has ONE canonical owner (events.user_id) plus up to three
// collaborators, managed entirely from the iFastNet My Event / Designer UI.
// Canvas never adds, removes or lists collaborators — it only ever asks one
// question: "may the account currently driving this browser open this event?"
//
// Vocabulary used throughout the canvas:
//   ACTOR — the account currently signed in and using Canvas.
//   OWNER — events.user_id. Unchanged by this feature, forever.
// They are no longer always the same person, so nothing may assume actor ===
// owner, and the actor's identity is NEVER swapped for the owner's.
//
// iFastNet is the single source of truth. check_event_access.php authorizes the
// caller from the PHP SESSION (it answers 401 "You must be signed in…" without
// one), which is why this is the only helper in this file that sends
// `credentials: "include"` — the cookie, not a query parameter, is the identity.
// A client-supplied role/user_id is therefore untrusted by construction: the URL
// may claim anything, and the answer below still comes from the server.
const ACCESS_ENDPOINT = `${API_BASE}/check_event_access.php`;

export type EventAccessRole = "owner" | "collaborator" | "designer";

// Everything the canvas is allowed to do with this event, decided by the
// BACKEND role — never recomputed from is_admin, the URL or localStorage.
export type EventAccess = {
  allowed: boolean;
  role: EventAccessRole;
  actorUserId: number;
  eventId: number;
  /** events.user_id as PHP reports it. Display/diagnostics only — never sent as `user_id`. */
  ownerUserId: number | null;
  isOwner: boolean;
  /** Edit Fabric objects, autosave, manual save, preview. True for every allowed role. */
  canEditCanvas: boolean;
  /**
   * Rename the event/design. Owner + designer only: sync_canvas_title.php
   * rewrites events.event_name, and PHP rebuilds the PUBLIC invitation slug
   * (https://vi-up.com/e/{title-slug}) from it — a collaborator renaming the
   * event would silently break an invitation link that guests already hold.
   */
  canRenameEvent: boolean;
  /** Owner-only surfaces: billing/package upgrade, ownership, event deletion. */
  canManageEvent: boolean;
  /**
   * May create the event's design row if none exists yet. Owner/designer only:
   * a collaborator must always land on the EXISTING canonical design, so if the
   * lookup comes back empty we fail loudly instead of forking the event.
   */
  canCreateDesign: boolean;
  /** Which check produced this verdict — "owner-fallback" is the pre-collaborator path. */
  source: "access-api" | "owner-fallback";
  /** Records PHP returned alongside the verdict, when it returns them. */
  user?: CanvasUser | null;
  event?: ViupEvent | null;
  message?: string;
};

// PHP's raw verdict, before capabilities are derived.
type AccessProbe =
  | {
      status: "granted";
      role: EventAccessRole;
      ownerUserId: number | null;
      user: CanvasUser | null;
      event: ViupEvent | null;
      canRename: boolean | null;
      canManage: boolean | null;
    }
  | { status: "denied"; message: string }
  /** Endpoint absent, unreachable, or the session cookie could not be attached. */
  | { status: "unavailable"; message: string };

function normalizeRole(raw: any): EventAccessRole | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "owner" || v === "primary" || v === "primary_owner") return "owner";
  if (v === "collaborator" || v === "client" || v === "collab") return "collaborator";
  if (v === "designer") return "designer";
  return null;
}

// Only an explicit boolean overrides the role default — an absent field must not
// read as `false` and quietly strip a designer's rename permission.
function optionalBool(...values: any[]): boolean | null {
  for (const v of values) {
    if (v === true || v === 1 || v === "1" || v === "true") return true;
    if (v === false || v === 0 || v === "0" || v === "false") return false;
  }
  return null;
}

/**
 * Ask iFastNet whether the signed-in actor may open this event.
 *
 * Never throws: a transport/CORS failure or a missing endpoint resolves to
 * "unavailable" so the caller can fall back to the legacy owner check rather
 * than locking every existing customer out of their own canvas.
 */
export async function checkEventAccess({
  eventId,
  designId = null,
}: {
  eventId: string | number;
  designId?: string | number | null;
}): Promise<AccessProbe> {
  const params = new URLSearchParams();
  params.set("event_id", String(eventId));
  if (designId != null && designId !== "") params.set("design_id", String(designId));

  let res: Response;
  try {
    res = await fetch(`${ACCESS_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      // The PHP session cookie IS the actor's identity for this endpoint.
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    // Offline, or the browser refused the credentialed cross-origin response
    // (vi-up.com must answer with Access-Control-Allow-Credentials: true).
    return {
      status: "unavailable",
      message: (e as Error)?.message || "Access check unreachable.",
    };
  }

  // The endpoint is not deployed on this host yet.
  if (res.status === 404 || res.status === 405) {
    return { status: "unavailable", message: `Access check unavailable (HTTP ${res.status}).` };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // PHP served an HTML error/login page — not a verdict we can act on.
    return { status: "unavailable", message: "Access check returned a non-JSON response." };
  }

  // No usable session. Treat as "unavailable" rather than "denied": the actor
  // may be a legitimate owner whose session simply never reached this origin,
  // and the owner fallback below still proves ownership through PHP.
  if (res.status === 401 || res.status === 403) {
    return { status: "unavailable", message: data?.message || "Not signed in to vi-up.com." };
  }

  const allowed = optionalBool(data?.allowed, data?.has_access, data?.access, data?.success);
  if (!res.ok || data?.success === false || allowed === false) {
    return {
      status: "denied",
      message: data?.message || data?.error || "You do not have access to this event.",
    };
  }

  // Access granted but no role named: PHP vouched for the actor without saying
  // how, so assume the least privileged role that can still edit.
  const role =
    normalizeRole(data?.access_role ?? data?.role ?? data?.actor_role ?? data?.user_role) ??
    "collaborator";

  return {
    status: "granted",
    role,
    ownerUserId: num(data?.owner_user_id ?? data?.event_user_id ?? data?.event?.user_id),
    user: (data?.user as CanvasUser) ?? null,
    event: (data?.event as ViupEvent) ?? null,
    canRename: optionalBool(
      data?.can_rename_event,
      data?.can_rename,
      data?.permissions?.rename_event,
    ),
    canManage: optionalBool(
      data?.can_manage_event,
      data?.can_manage,
      data?.permissions?.manage_event,
    ),
  };
}

// Capability defaults per backend role. Owner and designer keep exactly the
// powers they have today; collaborator is edit-only.
function capabilitiesFor(role: EventAccessRole) {
  const privileged = role === "owner" || role === "designer";
  return {
    canEditCanvas: true,
    canRenameEvent: privileged,
    canManageEvent: privileged,
    canCreateDesign: privileged,
  };
}

/**
 * Resolve what the actor may do with this event, backend-authoritatively.
 *
 * Order matters:
 *   1. check_event_access.php — the collaborator-aware verdict.
 *   2. If that endpoint is unavailable (not deployed, or no session reachable
 *      from this origin), fall back to the pre-existing ownership proof:
 *      get_user.php returns `event` only when the event belongs to the user.
 *      That IS the access rule Canvas shipped before collaborators existed, so
 *      owners, designers and events with no collaborator rows behave identically
 *      to before — this feature can never lock them out.
 *
 * A "denied" verdict from step 1 is final and is never softened by step 2.
 */
export async function resolveEventAccess({
  actorUserId,
  eventId,
  designId = null,
}: {
  actorUserId: string | number;
  eventId: string | number;
  designId?: string | number | null;
}): Promise<EventAccess> {
  const actor = num(actorUserId) ?? 0;
  const evt = num(eventId) ?? 0;

  const probe = await checkEventAccess({ eventId, designId });

  if (probe.status === "denied") {
    return {
      allowed: false,
      role: "collaborator",
      actorUserId: actor,
      eventId: evt,
      ownerUserId: null,
      isOwner: false,
      canEditCanvas: false,
      canRenameEvent: false,
      canManageEvent: false,
      canCreateDesign: false,
      source: "access-api",
      message: probe.message,
    };
  }

  if (probe.status === "granted") {
    const caps = capabilitiesFor(probe.role);
    return {
      allowed: true,
      role: probe.role,
      actorUserId: actor,
      eventId: evt,
      ownerUserId: probe.ownerUserId,
      isOwner: probe.role === "owner" || (probe.ownerUserId != null && probe.ownerUserId === actor),
      ...caps,
      // An explicit backend permission wins over the role default in BOTH
      // directions — that is the documented escape hatch for "this collaborator
      // may rename the event".
      canRenameEvent: probe.canRename ?? caps.canRenameEvent,
      canManageEvent: probe.canManage ?? caps.canManageEvent,
      source: "access-api",
      user: probe.user,
      event: probe.event,
    };
  }

  // ── Legacy owner check (unchanged pre-collaborator behaviour) ──────────────
  const data = await getUser(actorUserId, eventId).catch(() => null);
  const ownsEvent = !!(data?.success && data?.user && data?.event);

  return {
    allowed: ownsEvent,
    role: "owner",
    actorUserId: actor,
    eventId: evt,
    ownerUserId: ownsEvent ? num(data?.event?.user_id) ?? actor : null,
    isOwner: ownsEvent,
    canEditCanvas: ownsEvent,
    canRenameEvent: ownsEvent,
    canManageEvent: ownsEvent,
    canCreateDesign: ownsEvent,
    source: "owner-fallback",
    user: data?.user ?? null,
    event: data?.event ?? null,
    message: ownsEvent
      ? undefined
      : data?.message || "This event does not exist or is not shared with your account.",
  };
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
  canCreate = true,
}: {
  /** The ACTOR's id — the account driving the canvas, never the owner's. */
  userId: string | number;
  eventId: string | number;
  event?: Partial<ViupEvent> | null;
  /**
   * Whether this actor may create the event's design row when none is found.
   * Owner/designer: true (unchanged). Collaborator: false — they must always
   * land on the owner's EXISTING design, so an empty lookup is an error, not an
   * invitation to fork the event into a second design.
   */
  canCreate?: boolean;
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

  // No design row came back. For anyone but the owner/designer this means the
  // lookup could not reach the canonical design — creating one here would
  // duplicate the event's design and split the invitation in two.
  if (!canCreate) {
    throw new Error(
      "This event's design could not be opened for your account. Ask the event owner to open it once, then try again.",
    );
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
