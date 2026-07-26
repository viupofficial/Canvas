"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHandle } from "@/src/components/CanvasEditor";
import EditorLayoutClient from "@/src/components/EditorLayoutClient";
import Sidebar from "@/src/components/canvas-editor/sidebar";
import EditorHeader from "@/src/components/canvas-editor/editor-header";
import ImageEditorModal from "@/src/components/canvas-editor/ImageEditorModal";
import "@/src/app/globals.css";
import { useRouter } from "next/navigation";
import { EventDataProvider, useEventData, type EventData } from "@/src/store/EventDataContext";
import { ensureProject, saveProject } from "@/src/lib/projectStorage";
import { getCanvasUser } from "@/src/lib/userSession";
import { updateDesign, syncCanvasTitle, getCanvasName, getUser, num, type ViupEvent, type ViupDesign } from "@/src/lib/viupApi";
import type { CanvasUser } from "@/src/lib/userSession";
import { getPackageRules, readFeatureUsage, normalizeUsageCounter, type FeatureUsage } from "@/src/lib/packageRules";
import { PackageToastHost, showPackageToast } from "@/src/components/PackageLimitToast";
import PaymentUpgradeModal from "@/src/components/PaymentUpgradeModal";

const API_BASE = "https://vi-up.com/api";

// Editor experiences:
//  - "editor"         → staff/client editing one purchased event. Locked to the
//                       event: no dashboard/back/create. Logo → vi-up.com/MyEvent.
//  - "designer"       → legacy free editor (localStorage / project-id flows).
//  - "designer-event" → designer editing a specific event, but keeps dashboard nav.
export type EditorMode = "editor" | "designer" | "designer-event";

// Where an Apply from the image editor should write the edited result back to.
type ApplyTarget =
  | { kind: "canvas" }
  | { kind: "sidebar"; onReplace: (dataUrl: string) => void };

// "unsaved" = dirty (changes not yet persisted to the DB). Failures surface via
// saveError while the status falls back to "unsaved" until a retry succeeds.
type SaveStatus = "idle" | "unsaved" | "saving" | "saved";

// ── Local draft fallback (recovery only) ────────────────────────────────────
// On every canvas change the latest json_data is mirrored to localStorage under
// this key, and cleared again after a successful DB save — so a draft that
// survives to the next load means the previous session had unsaved changes.
// Event-bound canvases only: the legacy project flow already persists to
// localStorage via projectStorage.
const draftStorageKey = (designId: number) => `viup_canvas_draft_${designId}`;

// The whole design (every gallery photo lives inside it as a base64 data URL) is
// POSTed to update_design.php as one JSON body. Shared PHP hosting typically caps
// post_max_size at ~8MB and silently drops a body that exceeds it — the classic
// "some photos didn't save". Warn well before that so the user can trim images
// while the save can still succeed. Measured on the JSON string length (≈ bytes).
const SAVE_SIZE_WARN_BYTES = 6 * 1024 * 1024;

// MySQL timestamps ("YYYY-MM-DD HH:MM:SS") carry no timezone; this best-effort
// parse treats them as local time. It only guards against stale drafts from old
// sessions — the primary signal is that drafts are cleared on successful save.
function parseDbTime(s?: string | null): number | null {
  if (!s) return null;
  const str = String(s);
  const t = Date.parse(str.includes("T") ? str : str.replace(" ", "T"));
  return Number.isFinite(t) ? t : null;
}

export type ProjectEditorProps = {
  // Legacy project-id flow (localStorage + best-effort DB mirror).
  projectId?: string;
  teaser?: boolean;

  // Event-based flow (editor / designer-event). When `mode` is set and an
  // eventId is present, the canvas is bound to a single DB design record.
  mode?: EditorMode;
  userId?: number;
  eventId?: number;
  designId?: number;
  templateId?: number | null;
  user?: CanvasUser | null;
  event?: ViupEvent | null;
  design?: ViupDesign | null;
  // Decoded json_data from the design record: { version, eventData, canvas }.
  initialDesignJson?: any;
  // Internal: set by the outer wrapper when the user restored a local draft —
  // the restored state is not on the server yet, so the editor starts dirty.
  restoredFromDraft?: boolean;
};

export default function ProjectEditor(props: ProjectEditorProps) {
  const { projectId, mode, designId, initialDesignJson, design } = props;
  const isEventBound = !!mode && mode !== "designer" && designId != null;

  // ── Unsaved-draft recovery ────────────────────────────────────────────────
  // If a local draft outlived the last session (i.e. it was never cleared by a
  // successful save) and it is not older than the server copy, offer to restore
  // it. Restoring swaps the seed JSON and remounts the editor, so the normal
  // JSON loading path applies the draft — no separate restore logic.
  const [draftJson, setDraftJson] = useState<any | null>(null);
  const [restoredJson, setRestoredJson] = useState<any | null>(null);

  useEffect(() => {
    if (!isEventBound || designId == null) return;
    try {
      const key = draftStorageKey(designId);
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft?.json_data?.canvas) {
        window.localStorage.removeItem(key);
        return;
      }
      const serverTime = parseDbTime(design?.last_modified || design?.updated_at);
      if (serverTime != null && Number(draft.savedAt || 0) <= serverTime) {
        // Server copy is newer — the draft is stale, drop it.
        window.localStorage.removeItem(key);
        return;
      }
      setDraftJson(draft.json_data);
    } catch {
      /* corrupt draft — ignore */
    }
    // Runs once per design record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, isEventBound]);

  const effectiveJson = restoredJson ?? initialDesignJson;

  // Event-based flows seed the event data from THIS design's DB record, never
  // from the shared localStorage draft. Even when the record has no eventData
  // yet (json_data is {} / []), pass an empty object — not null — so the provider
  // treats the data as DB-owned and skips the global localStorage key. Falling
  // back to null here made every event read/write the same localStorage draft,
  // so contacts/calendar/location/rsvp/gift leaked across all events.
  const seededEventData: Partial<EventData> | null =
    mode && mode !== "designer"
      ? (effectiveJson?.eventData ?? {})
      : null;

  // Remount the whole editor when the underlying record changes so the canvas
  // fully re-initialises (per-project or per-design). Restoring a draft also
  // remounts so the draft JSON flows through the existing loading path.
  const remountKey =
    (designId != null ? `design-${designId}` : projectId ?? "legacy") +
    (restoredJson ? "-draft" : "");

  return (
    <EventDataProvider initialEventData={seededEventData}>
      <ProjectEditorInner
        key={remountKey}
        {...props}
        initialDesignJson={effectiveJson}
        restoredFromDraft={!!restoredJson}
      />
      {draftJson && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 rounded-full bg-white/95 border border-[#EDE2DE] px-4 py-2 text-[12px] font-semibold text-[#7D5B59] shadow">
          <span>We found an unsaved local draft. Restore it?</span>
          <button
            className="rounded-full bg-[#7D5B59] text-white px-3 py-1"
            onClick={() => {
              setRestoredJson(draftJson);
              setDraftJson(null);
            }}
          >
            Restore
          </button>
          <button
            className="rounded-full border border-[#EDE2DE] px-3 py-1"
            onClick={() => {
              // Rejected — discard the draft so it isn't offered again.
              if (designId != null) {
                try { window.localStorage.removeItem(draftStorageKey(designId)); } catch {}
              }
              setDraftJson(null);
            }}
          >
            Discard
          </button>
        </div>
      )}
    </EventDataProvider>
  );
}

function ProjectEditorInner({
  projectId,
  teaser,
  mode,
  userId,
  eventId,
  designId,
  templateId,
  event,
  initialDesignJson,
  restoredFromDraft,
}: ProjectEditorProps) {
  const editorRef = useRef<EditorHandle | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop");
  // Bumped whenever the active page's content is (re)loaded — the Background panel
  // watches this to re-read and display the current page's background.
  const [bgReadNonce, setBgReadNonce] = useState(0);
  const router = useRouter();

  const { eventData } = useEventData();

  // ── Package gating ─────────────────────────────────────────────────────────
  // All package feature rules (RSVP/Money-Gift visibility, gallery/location/
  // music limits) come from the shared helper so every surface stays consistent.
  // `livePackageId` overrides the mount-time event prop once the post-Stripe
  // poll below confirms the webhook applied an upgrade — features unlock without
  // a page reload.
  const [livePackageId, setLivePackageId] = useState<number | null>(null);
  const effectivePackageId = livePackageId ?? event?.package_id ?? null;
  const rules = getPackageRules(effectivePackageId);

  // ── Package upgrade (Stripe) ───────────────────────────────────────────────
  // The modal only ever form-POSTs to create_upgrade_checkout.php (same endpoint
  // as the MyEvent.php upgrade modal — NEVER checkout.php, which creates new
  // events); Canvas never writes events.package_id itself. Opening the modal is
  // gated so Premium events (nothing left to buy) just get a toast instead.
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const openUpgrade = useCallback(() => {
    if (rules.isPremiumPackage) {
      showPackageToast("You already have Premium.");
      return;
    }
    setUpgradeOpen(true);
  }, [rules.isPremiumPackage]);

  // Handle the return from Stripe (create_upgrade_checkout.php). The actual
  // package update happens server-side in the Stripe webhook — we never trust
  // the URL alone. Returning from Stripe is a full page load, so
  // EventCanvasGuard refetches the event before we mount; but the webhook can
  // lag the redirect, so if package_id hasn't reached the ?target=… the upgrade
  // modal embedded in return_to, poll get_user.php a few times before showing a
  // soft "still processing" warning. package_id is the only source of truth.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") !== "1") return;

    const status = params.get("payment");
    const isDummy = params.get("dummy") === "1";
    const target = num(params.get("target")) ?? 0;

    // Drop only the payment-return params (keep user_id/event_id and friends)
    // so a refresh doesn't re-toast or re-poll.
    const scrubPaymentParams = () => {
      const url = new URL(window.location.href);
      ["payment", "upgrade", "dummy", "target"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, document.title, url.toString());
    };

    if (status === "cancelled") {
      showPackageToast("Payment cancelled. Your package was not changed.");
      scrubPaymentParams();
      return;
    }
    if (status !== "success") return;
    scrubPaymentParams();

    // Legacy dummy flow: the PHP endpoint updated package_id synchronously
    // before redirecting, so the mount-time refetch is already current.
    if (isDummy) {
      showPackageToast("Package upgraded successfully. Dummy test mode.");
      return;
    }

    const mountedPackageId = num(event?.package_id) ?? 0;
    if (target > 0 && mountedPackageId >= target) {
      // Webhook finished before this page load — nothing to wait for.
      showPackageToast("Payment successful! Your package has been upgraded.");
      return;
    }

    showPackageToast("Payment successful! Confirming your upgrade...");
    if (userId == null || eventId == null) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 6;
    const POLL_DELAY_MS = 2500;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const data = await getUser(userId, eventId);
        if (cancelled) return;
        const fetched = num(data.event?.package_id) ?? 0;
        // With a target we wait for it exactly; without one (PHP stripped the
        // param) any increase over the mount-time value counts as confirmed.
        const confirmed = target > 0 ? fetched >= target : fetched > mountedPackageId;
        if (confirmed) {
          setLivePackageId(fetched);
          showPackageToast("Upgrade confirmed! Your new features are unlocked.");
          return;
        }
      } catch {
        /* transient network/API error — retry below */
      }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        showPackageToast(
          "Payment received — your upgrade is still processing. Refresh this page in a moment.",
        );
        return;
      }
      window.setTimeout(poll, POLL_DELAY_MS);
    };
    poll();

    return () => {
      cancelled = true;
    };
    // Mount-only: reads the one-shot payment params from the Stripe return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Location/music change counters persisted inside designs.json_data (NOT the
  // events table). Seeded from the loaded design; only real, successful changes
  // increment them. Premium/Standard/legacy have Infinity limits so the counters
  // are effectively cosmetic there.
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage>(() =>
    readFeatureUsage(initialDesignJson),
  );

  // Is this canvas bound to a single DB event/design?
  const isEventMode = !!mode && mode !== "designer" && designId != null && eventId != null;

  const initialEventName =
    (isEventMode
      ? initialDesignJson?.canvas?.eventName || getCanvasName(event)
      : undefined) ?? "Bride & Groom";
  const [eventName, setEventName] = useState(initialEventName);

  // ── Title autosync (debounced) ────────────────────────────────────────────
  // Event-bound canvases push title edits to PHP automatically via
  // sync_canvas_title.php, which updates BOTH designs.name and events.event_name
  // (the MyEvent card) for this exact user/event/design. Seed the "last synced"
  // ref with the title loaded from PHP so we never fire a redundant sync on load
  // — only an actual user edit triggers a request.
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  const [titleError, setTitleError] = useState("");
  const lastSyncedTitleRef = useRef(String(initialEventName || "").trim());
  // Guards against out-of-order responses: only the latest sync may commit.
  const titleSyncSeqRef = useRef(0);

  // ── Initial canvas data ──────────────────────────────────────────────────
  // Event mode hydrates from the DB record; legacy project-id flow reads the
  // localStorage copy on the client (gated to avoid hydration mismatch).
  const [loaded, setLoaded] = useState(isEventMode || !projectId);
  const [initialCanvasJson, setInitialCanvasJson] = useState<any | null>(
    isEventMode ? (initialDesignJson?.canvas ?? null) : null,
  );

  useEffect(() => {
    if (isEventMode || !projectId) return;
    const project = ensureProject(projectId);
    const cj = project.canvasJson ?? null;
    setInitialCanvasJson(cj);
    if (cj?.eventName) setEventName(cj.eventName);
    setLoaded(true);
  }, [projectId, isEventMode]);

  // ── Save (manual + debounced autosave) ───────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Autosave reliability layer ────────────────────────────────────────────
  // Wraps the existing persist() below with dirty tracking, a single-flight
  // save queue and a localStorage fallback. persist() itself — the payload,
  // endpoint and json_data shape — is unchanged.
  const dirtyRef = useRef(false);
  const changeSeqRef = useRef(0); // bumps on every canvas change
  const saveInFlightRef = useRef(false); // only one persist() runs at a time
  const pendingSaveRef = useRef(false); // a save was requested mid-flight
  const pendingSyncTitleRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latches the oversized-payload warning so autosave (every ~2s) doesn't spam
  // the toast; re-arms once the design shrinks back under the threshold.
  const largeSaveWarnedRef = useRef(false);

  // `syncTitle` is only true for a manual Save: that's when we push the canvas
  // title back to events.event_name (the MyEvent card). Autosave never touches
  // the event title — it would fire on every canvas edit.
  // Resolves true on success so the reliability wrapper (runSave) can clear the
  // dirty flag / local draft; it never rejects.
  const persist = useCallback(
    (opts?: { syncTitle?: boolean }): Promise<boolean> => {
    const syncTitle = !!opts?.syncTitle;
    const data = editorRef.current?.getProjectData?.();
    const thumbnail = editorRef.current?.getThumbnail?.() ?? "";

    // ── Event-bound save → always scoped to this event/design ──────────────
    if (isEventMode) {
      if (!data) return Promise.resolve(false);

      const cleanTitle = String(eventName || "").trim();

      // Manual save validation — designId/eventId are guaranteed by isEventMode,
      // but the title must not be blank when we're syncing it to MyEvent.
      if (syncTitle && !cleanTitle) {
        setSaveError("Title cannot be empty.");
        return Promise.resolve(false);
      }

      setSaveError("");
      setSaveStatus("saving");
      const json_data = {
        version: 1,
        eventData,
        canvas: { ...data, eventName: cleanTitle || eventName },
        featureUsage,
      };

      // Warn once when the design gets large enough that PHP may reject the save
      // (dropping recently added photos). Re-arms if the user trims it back down.
      const approxBytes = JSON.stringify(json_data).length;
      if (approxBytes > SAVE_SIZE_WARN_BYTES) {
        if (!largeSaveWarnedRef.current) {
          largeSaveWarnedRef.current = true;
          showPackageToast(
            "This design is very large — some photos may not save. Try removing a few gallery images.",
            "warn",
          );
        }
      } else {
        largeSaveWarnedRef.current = false;
      }

      // Flush the title to PHP first (manual save only) so events.event_name +
      // designs.name are guaranteed in sync even if the debounced autosync hasn't
      // fired yet. Only when the title actually changed — and only with the full
      // user/event/design key (never title-only). Then save the design itself.
      const titleStep =
        syncTitle &&
        cleanTitle !== lastSyncedTitleRef.current &&
        eventId != null &&
        userId != null &&
        designId != null
          ? syncCanvasTitle({ userId, eventId, designId, title: cleanTitle })
              .then(() => {
                lastSyncedTitleRef.current = cleanTitle;
                // A pending autosync for the same edit is now redundant.
                titleSyncSeqRef.current++;
              })
              .catch((e) => {
                console.error("[ProjectEditor] title sync failed", e);
                throw new Error("Failed to sync title.");
              })
          : Promise.resolve();

      return titleStep
        .then(() =>
          updateDesign({
            user_id: num(userId),
            event_id: num(eventId),
            design_id: num(designId),
            name: cleanTitle || getCanvasName(event),
            json_data,
            preview_url: thumbnail || null,
            status: "draft",
          }).catch((e) => {
            console.error("[ProjectEditor] design save failed", e);
            // The title may already have been updated — be explicit about it.
            throw new Error(
              syncTitle
                ? "Title updated, but design save failed. Please save again."
                : (e as Error)?.message || "Failed to save.",
            );
          }),
        )
        .then(() => {
          if (syncTitle) setEventName(cleanTitle);
          setSaveStatus("saved");
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          // Only fall back to idle if nothing new happened meanwhile (a fresh
          // edit sets "unsaved"; a queued save sets "saving").
          savedTimerRef.current = setTimeout(
            () => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
            1500,
          );
          return true;
        })
        .catch((e) => {
          console.error("[ProjectEditor] event save failed", e);
          // Still dirty — the local draft (written on every change) covers us
          // until the retry succeeds.
          setSaveStatus("unsaved");
          setSaveError(
            `${(e as Error)?.message || "Failed to save."} Your changes are saved locally — retrying…`,
          );
          return false;
        });
    }

    // ── Legacy ephemeral editor (no project id) ────────────────────────────
    if (!projectId) {
      editorRef.current?.save();
      return Promise.resolve(true);
    }

    // ── Legacy project-id flow: localStorage + best-effort DB mirror ───────
    if (!data) return Promise.resolve(false);
    setSaveStatus("saving");
    try {
      saveProject(projectId, { canvasJson: { ...data, eventName }, thumbnail });
    } catch (e) {
      console.error("[ProjectEditor] local save failed", e);
    }

    const user = getCanvasUser();
    if (!user) {
      console.warn("[ProjectEditor] no viup_canvas_user — skipping DB save");
      setSaveStatus("idle");
      // Local save succeeded; in this flow localStorage IS the primary store.
      return Promise.resolve(true);
    }

    const json_data = { version: 1, eventData, canvas: { ...data, eventName } };
    return fetch(`${API_BASE}/update_design.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design_id: Number(projectId), user_id: user.id, json_data }),
    })
      .then((res) => res.json())
      .then(() => {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(
          () => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
          1500,
        );
        return true;
      })
      .catch((e) => {
        console.error("[ProjectEditor] DB save failed", e);
        setSaveStatus("idle");
        // The DB mirror is best-effort here — the localStorage save above is
        // authoritative for the legacy flow, so treat this as a success.
        return true;
      });
    },
    [isEventMode, projectId, eventName, eventData, userId, eventId, designId, event, featureUsage],
  );

  // Always call the freshest persist from the debounced timer.
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // ── Local draft fallback (event mode only) ──────────────────────────────
  // Mirrors the same json_data shape persist() sends — minus the thumbnail,
  // which is the only sizeable base64 blob — for crash/offline recovery.
  const localDraftKey = isEventMode && designId != null ? draftStorageKey(designId) : null;
  const saveLocalDraft = useCallback(() => {
    if (!localDraftKey) return;
    const data = editorRef.current?.getProjectData?.();
    if (!data) return;
    try {
      window.localStorage.setItem(
        localDraftKey,
        JSON.stringify({
          savedAt: Date.now(),
          json_data: {
            version: 1,
            eventData,
            canvas: { ...data, eventName },
            featureUsage,
          },
        }),
      );
    } catch {
      /* quota exceeded / private mode — the draft is best-effort */
    }
  }, [localDraftKey, eventData, eventName, featureUsage]);
  const saveLocalDraftRef = useRef(saveLocalDraft);
  saveLocalDraftRef.current = saveLocalDraft;

  const clearLocalDraft = useCallback(() => {
    if (!localDraftKey) return;
    try {
      window.localStorage.removeItem(localDraftKey);
    } catch {}
  }, [localDraftKey]);
  const clearLocalDraftRef = useRef(clearLocalDraft);
  clearLocalDraftRef.current = clearLocalDraft;

  // ── Single-flight save queue ─────────────────────────────────────────────
  // All saves (autosave, manual, preview, retries) go through here so only one
  // persist() runs at a time. persist() snapshots the canvas when it starts,
  // so with saves serialized, an older response can never land after a newer
  // one — and if edits arrive mid-flight we immediately save again, so the
  // latest state always wins.
  const runSaveRef = useRef<(opts?: { syncTitle?: boolean }) => void>(() => {});
  const runSave = useCallback((opts?: { syncTitle?: boolean }) => {
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      if (opts?.syncTitle) pendingSyncTitleRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    const seqAtStart = changeSeqRef.current;
    persistRef
      .current(opts)
      .then((ok) => {
        saveInFlightRef.current = false;
        const changedDuringSave = changeSeqRef.current !== seqAtStart;
        if (ok && !changedDuringSave) {
          // The saved snapshot is the latest state → truly clean.
          dirtyRef.current = false;
          clearLocalDraftRef.current();
        }
        if (pendingSaveRef.current || (ok && changedDuringSave)) {
          // Someone asked for a save mid-flight (or edits arrived) — save the
          // latest state right away.
          pendingSaveRef.current = false;
          const syncTitle = pendingSyncTitleRef.current;
          pendingSyncTitleRef.current = false;
          runSaveRef.current(syncTitle ? { syncTitle } : undefined);
        } else if (!ok && dirtyRef.current) {
          // Failed save — make sure the latest state is in localStorage, then
          // retry shortly. The 30s fallback interval also covers this if the
          // timer is lost.
          saveLocalDraftRef.current();
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (dirtyRef.current && !saveInFlightRef.current) runSaveRef.current();
          }, 5000);
        }
      })
      .catch(() => {
        // persist() never rejects, but never leave the queue locked.
        saveInFlightRef.current = false;
      });
  }, []);
  runSaveRef.current = runSave;

  // Manual Save / Preview path: skip the debounce and save immediately. If a
  // save is mid-flight runSave queues it, so the latest state is still saved.
  const forceSaveNow = useCallback(
    (opts?: { syncTitle?: boolean }) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      runSave(opts);
    },
    [runSave],
  );

  // Autosave applies to any record-backed canvas (event or project id).
  const autosaveEnabled = isEventMode || !!projectId;
  const handleCanvasChange = useCallback(() => {
    if (!autosaveEnabled) return;
    // Mark dirty + mirror to localStorage immediately; debounce the DB save so
    // bursts (drag/resize/typing) collapse into one request ~2s after the last
    // change.
    changeSeqRef.current++;
    dirtyRef.current = true;
    setSaveStatus((s) => (s === "saving" ? s : "unsaved"));
    saveLocalDraftRef.current();
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => runSaveRef.current(), 2000);
  }, [autosaveEnabled]);

  // A restored local draft is not on the server yet — start dirty and schedule
  // a save so it persists even if the user never edits again.
  useEffect(() => {
    if (!restoredFromDraft || !autosaveEnabled) return;
    dirtyRef.current = true;
    setSaveStatus("unsaved");
    autosaveTimerRef.current = setTimeout(() => runSaveRef.current(), 2000);
    // Mount-only by design (restoredFromDraft is fixed per mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Periodic fallback + emergency save triggers ──────────────────────────
  useEffect(() => {
    if (!autosaveEnabled) return;

    // If the user edits non-stop the debounce keeps resetting; this guarantees
    // a save at least every 30s while dirty.
    const interval = setInterval(() => {
      if (dirtyRef.current && !saveInFlightRef.current) runSaveRef.current();
    }, 30000);

    // Tab hidden → flush now (both locally and via the normal save path).
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && dirtyRef.current) {
        saveLocalDraftRef.current();
        runSaveRef.current();
      }
    };
    // Unload → synchronous localStorage write only; the API can't be relied on
    // during unload. The draft prompt recovers it on the next visit.
    const onBeforeUnload = () => {
      if (dirtyRef.current) saveLocalDraftRef.current();
    };
    // Back online → retry pushing any unsaved changes to the server.
    const onOnline = () => {
      if (dirtyRef.current) runSaveRef.current();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
    };
  }, [autosaveEnabled]);

  // ── Feature-usage counters (24-hour rate limit) ────────────────────────────
  // Fired only on a real, successful change. The sidebar does the up-front
  // limit check + upgrade toast/message; these normalise the counter (which
  // rolls the 24-hour window over if it has expired), increment it, and schedule
  // an autosave so the updated window is persisted into json_data.
  const handleMusicChanged = useCallback(() => {
    setFeatureUsage((u) => {
      const normalized = normalizeUsageCounter(u.music);
      return { ...u, music: { ...normalized, count: normalized.count + 1 } };
    });
    handleCanvasChange();
  }, [handleCanvasChange]);

  const handleLocationChanged = useCallback(() => {
    setFeatureUsage((u) => {
      const normalized = normalizeUsageCounter(u.location);
      return { ...u, location: { ...normalized, count: normalized.count + 1 } };
    });
    handleCanvasChange();
  }, [handleCanvasChange]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Debounced title autosync — event-bound canvases only. Fires ~1s after the
  // user stops typing; skips empty / over-long / unchanged titles; never runs in
  // free-design mode (no event_id/design_id). The cleanup cancels the pending
  // request on every keystroke so only the final title is sent.
  useEffect(() => {
    if (!isEventMode || userId == null || eventId == null || designId == null) return;
    const cleanTitle = String(eventName || "").trim();
    if (!cleanTitle || cleanTitle.length > 120) return;
    if (cleanTitle === lastSyncedTitleRef.current) return;

    const timer = setTimeout(() => {
      const seq = ++titleSyncSeqRef.current;
      setTitleSaving(true);
      setTitleSaved(false);
      setTitleError("");
      syncCanvasTitle({ userId, eventId, designId, title: cleanTitle })
        .then(() => {
          if (seq !== titleSyncSeqRef.current) return; // superseded by a newer edit
          lastSyncedTitleRef.current = cleanTitle;
          setTitleSaved(true);
        })
        .catch((e) => {
          if (seq !== titleSyncSeqRef.current) return;
          console.error("[ProjectEditor] title sync failed", e);
          setTitleError((e as Error)?.message || "Failed to sync title.");
        })
        .finally(() => {
          if (seq !== titleSyncSeqRef.current) return;
          setTitleSaving(false);
        });
    }, 1000);

    return () => clearTimeout(timer);
  }, [eventName, isEventMode, userId, eventId, designId]);

  // ── Image editor state ──────────────────────────────────────────────────────
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [selectedImageForEditing, setSelectedImageForEditing] = useState<string | null>(null);
  const [editorCropMode, setEditorCropMode] = useState(false);
  const originalImageReference = useRef<ApplyTarget | null>(null);

  const openImageEditor = (src: string, target: ApplyTarget, crop = false) => {
    originalImageReference.current = target;
    setSelectedImageForEditing(src);
    setEditorCropMode(crop);
    setImageEditorOpen(true);
  };

  const closeImageEditor = () => {
    setImageEditorOpen(false);
    setSelectedImageForEditing(null);
    setEditorCropMode(false);
    originalImageReference.current = null;
  };

  const handleCanvasEditImage = (src: string, opts?: { crop?: boolean }) => {
    openImageEditor(src, { kind: "canvas" }, !!opts?.crop);
  };

  const handleSidebarEditImage = (src: string, onReplace: (dataUrl: string) => void) => {
    openImageEditor(src, { kind: "sidebar", onReplace });
  };

  const handleApplyEditedImage = (dataUrl: string) => {
    const target = originalImageReference.current;
    if (target?.kind === "canvas") {
      editorRef.current?.replaceActiveImage(dataUrl);
    } else if (target?.kind === "sidebar") {
      target.onReplace(dataUrl);
    }
    closeImageEditor();
  };

  // Package 1 (Basic) hides the RSVP and Money Gift tools; every other tier — and
  // null/undefined package_id from old events or an API build that predates the
  // column — keeps both visible. Sourced from the shared rules helper.
  const showRsvpAndMoneyGift = rules.showRsvpAndMoneyGift;

  if (!loaded) {
    return (
      <main className="h-screen flex items-center justify-center bg-brand-cream text-[#7D5B59]">
        Loading project…
      </main>
    );
  }

  // Logo / "home" target depends on the experience:
  //  - editor: locked out of the app — return to the My Event page on vi-up.com.
  //  - designer / designer-event: back to the designer dashboard.
  //  - legacy: let EditorHeader's own path-based rule decide.
  const homeHref =
    mode === "editor"
      ? "https://vi-up.com/MyEvent"
      : mode === "designer" || mode === "designer-event"
      ? userId != null
        ? `/designer?user_id=${userId}`
        : "/"
      : undefined;

  const showRecordSaveStatus = isEventMode || !!projectId;

  const initialPages = isEventMode || projectId ? (initialCanvasJson?.pages ?? [null]) : undefined;
  const initialMusicUrl = isEventMode || projectId ? (initialCanvasJson?.musicUrl ?? null) : null;
  // Persisted in the same json_data.canvas blob as the pages/music — designs
  // saved before Continuous Scroll existed have no value and stay page mode.
  const initialPresentationMode =
    isEventMode || projectId ? (initialCanvasJson?.presentationMode ?? null) : null;

  return (
    <main className="h-screen overflow-hidden bg-brand-cream">
      <div className="w-full max-w-full mx-auto h-full flex flex-col">
        <EditorHeader
          editorRef={editorRef as React.RefObject<EditorHandle>}
          mode={mode}
          homeHref={homeHref}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onSave={() => {
            // Don't save mid-upload — the track wouldn't be in the design yet.
            if (editorRef.current?.isMusicUploading?.()) {
              showPackageToast("Music is still uploading — please wait a moment.", "warn");
              return;
            }
            forceSaveNow({ syncTitle: true });
          }}
          // Premium is the highest tier — no upgrade path, so hide the button
          // entirely by not wiring a handler (EditorHeader only renders it when
          // onUpgrade is present).
          onUpgrade={rules.isPremiumPackage ? undefined : openUpgrade}
          onPreview={() => {
            // Music still transferring? Publishing now would bake a design with
            // no track into the blob /e/[slug] reads — wait for it to finish.
            if (editorRef.current?.isMusicUploading?.()) {
              showPackageToast("Music is still uploading — please wait a moment before previewing.", "warn");
              return;
            }
            // Persist the design to the DB first (same path as Save/autosave),
            // then publish + open the hosted page. The save is fire-and-forget:
            // /e/[slug] reads the uploaded blob, not the designs row.
            forceSaveNow();
            editorRef.current?.exportHTML(eventName).then((slug) => router.push(`/e/${slug}`));
          }}
          onPreviewLocal={() => {
            if (editorRef.current?.isMusicUploading?.()) {
              showPackageToast("Music is still uploading — please wait a moment before previewing.", "warn");
              return;
            }
            // Local preview reads IndexedDB, but still flush the design to the DB
            // so a preview always leaves a saved record behind.
            forceSaveNow();
            editorRef.current?.previewLocal(eventName);
          }}
          teaser={teaser}
          onLogin={() => { window.location.href = "https://vi-up.com/login"; }}
          eventName={eventName}
          onEventNameChange={(name: string) => {
            // Update local state immediately (canvas editing is never blocked);
            // the debounced effect handles the PHP sync. Reset the per-edit sync
            // indicators so a fresh "saving → saved" cycle can show.
            setEventName(name);
            if (saveError) setSaveError("");
            if (titleError) setTitleError("");
            if (titleSaved) setTitleSaved(false);
          }}
          titleSyncStatus={
            titleError ? "error" : titleSaving ? "saving" : titleSaved ? "saved" : "idle"
          }
          titleSyncError={titleError}
        />

        <div className="flex w-full gap-6 flex-1 min-h-0 overflow-hidden">
          <Sidebar
            editorRef={editorRef}
            isPhonePreview={previewMode === "phone"}
            onEditImage={handleSidebarEditImage}
            bgReadNonce={bgReadNonce}
            showRsvpAndMoneyGift={showRsvpAndMoneyGift}
            teaser={teaser}
            rules={rules}
            featureUsage={featureUsage}
            onLocationChanged={handleLocationChanged}
            onUpgrade={openUpgrade}
          />

          <div className="flex-1 min-w-0">
            <EditorLayoutClient
              editorRef={editorRef}
              contacts={eventData.contacts}
              moneyGift={eventData.moneyGift}
              calendar={eventData.calendar}
              location={eventData.location}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              eventName={eventName}
              onEditImage={handleCanvasEditImage}
              onCanvasChange={handleCanvasChange}
              onContentReplaced={() => setBgReadNonce((n) => n + 1)}
              onMusicChange={handleMusicChanged}
              initialPages={initialPages}
              initialMusicUrl={initialMusicUrl}
              initialPresentationMode={initialPresentationMode}
              userId={userId}
              eventId={eventId}
              packageId={effectivePackageId}
            />
          </div>
        </div>
      </div>

      {/* Top toast for package-limit upgrade nudges (gallery/location/music). */}
      <PackageToastHost />

      {/* Stripe upgrade — form-POSTs to create_upgrade_checkout.php, never writes
          package_id from here. Only meaningful for event-bound canvases. */}
      {isEventMode && eventId != null && (
        <PaymentUpgradeModal
          isOpen={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          eventId={eventId}
          currentPackageId={rules.packageId as number | null}
        />
      )}

      {/* TODO(teaser upgrade): the teaser's Upgrade Package button is NOT wired
          to Stripe yet. When ready, render the modal in teaser too — teaser has
          no real event, so eventId falls back to 0:

      {teaser && (
        <PaymentUpgradeModal
          isOpen={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          eventId={eventId ?? 0}
          currentPackageId={rules.packageId as number | null}
        />
      )} */}

      {/* Hidden while saveError shows — the error alert occupies the same spot
          and already says the draft is kept locally / retrying. */}
      {showRecordSaveStatus && saveStatus !== "idle" && !saveError && (
        <div className="fixed bottom-4 right-4 z-[90] rounded-full bg-white/90 border border-[#EDE2DE] px-4 py-1.5 text-[12px] font-semibold text-[#7D5B59] shadow">
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "unsaved"
            ? "Unsaved changes"
            : "Saved ✓"}
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[90] max-w-xs rounded-lg bg-[#FDECEC] border border-[#F3B6B6] px-4 py-2 text-[12px] font-semibold text-[#B23B3B] shadow"
        >
          {saveError}
        </div>
      )}

      {imageEditorOpen && selectedImageForEditing && (
        <ImageEditorModal
          imageSrc={selectedImageForEditing}
          startInCrop={editorCropMode}
          onCancel={closeImageEditor}
          onApply={handleApplyEditedImage}
        />
      )}
    </main>
  );
}
