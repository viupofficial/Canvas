"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GradientDescriptor } from "@/src/lib/gradient";

export type ContactItem = { name: string; phone: string };
export type LocationData = {
  address?: string;
  // Whether Location is offered in the invitation footer. Treated as ON when
  // undefined so pre-existing designs keep showing it. Mirrors RSVPConfig.enabled.
  enabled?: boolean;
} | null;
export type CalendarData = {
  // Optional so the section can hold only the `enabled` flag before a date is
  // picked (and keep it after the date is cleared again).
  date?: string;
  // Optional fields used by calendar export (ICS / Google link). All optional —
  // pre-existing records with only `date` continue to work unchanged.
  startTime?: string;
  endTime?: string;
  endDate?: string;
  title?: string;
  description?: string;
  reminderMinutes?: number;
  // Whether Calendar is offered in the invitation footer. Treated as ON when
  // undefined so pre-existing designs keep showing it. Note this only hides the
  // footer entry — `date` still drives the canvas countdown element.
  enabled?: boolean;
} | null;
export type GiftData = {
  // Optional so the section can hold only the `enabled` flag before the form is
  // filled in — turning the toggle off never discards saved form data.
  bank?: string;
  account?: number | string;
  image?: string | null;
  // QR display size in px (square). Undefined/null falls back to QR_DEFAULT_SIZE.
  qrSize?: number | null;
  // Whether Money Gift is offered in the invitation footer. Treated as ON when
  // undefined so pre-existing designs keep showing it — subject to the package
  // rules, which always win (see src/lib/footerNav.ts).
  enabled?: boolean;
} | null;

// Money Gift QR display bounds (px). Shared by the footer render and the editor
// slider so both agree on the range and the fallback size.
export const QR_MIN_SIZE = 140;
export const QR_MAX_SIZE = 350;
export const QR_DEFAULT_SIZE = 240;
export type RSVPConfig = {
  // Whether RSVP is available on the invitation. Treated as ON when undefined so
  // pre-existing designs (saved before this toggle existed) keep showing RSVP.
  enabled?: boolean;
  maxGuest?: number;
  // Nav bar / circle colors accept a solid CSS color string or a gradient
  // descriptor (see src/lib/gradient.ts); consumers render via cssBackground().
  navColor?: string | GradientDescriptor;
  navOpacity?: number;
  textColor?: string;
  textOpacity?: number;
  // The half-circle "notch" behind the RSVP circle (.footer-container::before).
  circleColor?: string | GradientDescriptor;
  circleOpacity?: number;
} | null;

export type EventData = {
  contacts: ContactItem[];
  location: LocationData;
  calendar: CalendarData;
  moneyGift: GiftData;
  rsvpConfig: RSVPConfig;
};

export type EventSection = keyof EventData;

const DEFAULT_EVENT_DATA: EventData = {
  contacts: [],
  location: null,
  calendar: null,
  moneyGift: null,
  rsvpConfig: null,
};

const STORAGE_KEY = "viup_event_data";
const DEBOUNCE_MS = 300;
const PREVIEW_PULSE_MS = 900;

type Ctx = {
  /** Live value — reflects the latest input immediately (for responsive inputs/UI). */
  eventData: EventData;
  /** Debounced value — changes 300ms after the last edit. Consumers that are
   *  expensive to re-render (Fabric canvas sync) should read this one. */
  debouncedEventData: EventData;
  /** Merge-patch a section. Accepts partial for object sections, or full value. */
  updateEventData: <K extends EventSection>(
    section: K,
    value: EventData[K] | Partial<NonNullable<EventData[K]>>,
  ) => void;
  /** Replace a section wholesale (used by Save buttons and bulk operations). */
  setSection: <K extends EventSection>(section: K, value: EventData[K]) => void;
  /** Which section was touched most recently, cleared after PREVIEW_PULSE_MS. */
  lastUpdatedSection: EventSection | null;
  /** True briefly after any update — drives the "Live Preview Active" badge. */
  isPreviewPulsing: boolean;
};

const EventDataContext = createContext<Ctx | null>(null);

function loadFromStorage(): EventData {
  if (typeof window === "undefined") return DEFAULT_EVENT_DATA;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EVENT_DATA;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_EVENT_DATA, ...parsed };
  } catch {
    return DEFAULT_EVENT_DATA;
  }
}

export function EventDataProvider({
  children,
  initialEventData,
}: {
  children: React.ReactNode;
  // When provided (event-based editor/designer flows), the event data comes from
  // the design record in the DB rather than localStorage. Takes precedence.
  initialEventData?: Partial<EventData> | null;
}) {
  const [eventData, setEventData] = useState<EventData>(DEFAULT_EVENT_DATA);
  const [debouncedEventData, setDebouncedEventData] = useState<EventData>(DEFAULT_EVENT_DATA);
  const [lastUpdatedSection, setLastUpdatedSection] = useState<EventSection | null>(null);
  const [isPreviewPulsing, setIsPreviewPulsing] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate once (client-only). Seed from the DB record when an event design was
  // passed in; otherwise fall back to the legacy localStorage draft.
  useEffect(() => {
    const initial = initialEventData
      ? { ...DEFAULT_EVENT_DATA, ...initialEventData }
      : loadFromStorage();
    setEventData(initial);
    setDebouncedEventData(initial);
    hydratedRef.current = true;
    // Only seed on mount — subsequent edits flow through updateEventData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist immediately (the localStorage write itself is cheap). Skipped for
  // event-based flows — that data is owned by the DB design record, not the
  // shared localStorage draft.
  useEffect(() => {
    if (!hydratedRef.current || initialEventData) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(eventData));
    } catch {
      /* quota/private-mode — ignore */
    }
  }, [eventData, initialEventData]);

  const triggerPulse = useCallback((section: EventSection) => {
    setLastUpdatedSection(section);
    setIsPreviewPulsing(true);
    if (pulseRef.current) clearTimeout(pulseRef.current);
    pulseRef.current = setTimeout(() => {
      setIsPreviewPulsing(false);
      setLastUpdatedSection(null);
    }, PREVIEW_PULSE_MS);
  }, []);

  const scheduleDebounced = useCallback((next: EventData) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedEventData(next);
    }, DEBOUNCE_MS);
  }, []);

  const applyChange = useCallback(
    (section: EventSection, compute: (prev: EventData) => EventData) => {
      setEventData((prev) => {
        const next = compute(prev);
        scheduleDebounced(next);
        return next;
      });
      triggerPulse(section);
    },
    [scheduleDebounced, triggerPulse],
  );

  const updateEventData: Ctx["updateEventData"] = useCallback(
    (section, value) => {
      applyChange(section, (prev) => {
        const current = prev[section];
        // Arrays / primitives / null → replace; objects → shallow-merge.
        if (
          Array.isArray(value) ||
          value === null ||
          typeof value !== "object"
        ) {
          return { ...prev, [section]: value as EventData[typeof section] };
        }
        if (current && typeof current === "object" && !Array.isArray(current)) {
          return {
            ...prev,
            [section]: { ...(current as object), ...(value as object) } as EventData[typeof section],
          };
        }
        return { ...prev, [section]: value as EventData[typeof section] };
      });
    },
    [applyChange],
  );

  const setSection: Ctx["setSection"] = useCallback(
    (section, value) => {
      applyChange(section, (prev) => ({ ...prev, [section]: value }));
    },
    [applyChange],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pulseRef.current) clearTimeout(pulseRef.current);
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      eventData,
      debouncedEventData,
      updateEventData,
      setSection,
      lastUpdatedSection,
      isPreviewPulsing,
    }),
    [eventData, debouncedEventData, updateEventData, setSection, lastUpdatedSection, isPreviewPulsing],
  );

  return <EventDataContext.Provider value={value}>{children}</EventDataContext.Provider>;
}

export function useEventData(): Ctx {
  const ctx = useContext(EventDataContext);
  if (!ctx) {
    throw new Error("useEventData must be used within an EventDataProvider");
  }
  return ctx;
}

/** Non-throwing variant — returns null when used outside a provider.
 *  Components that may render in both contexts (e.g. EventFooter used on
 *  the editor page AND the standalone /rsvp preview page) can use this. */
export function useEventDataOptional(): Ctx | null {
  return useContext(EventDataContext);
}
