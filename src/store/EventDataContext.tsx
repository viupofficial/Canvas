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
/** One place guests can send a gift: a bank, its account number, the QR they
 *  scan, and how large that QR is shown. A Money Gift section holds up to
 *  GIFT_MAX_ACCOUNTS of these and guests swipe between them. */
export type GiftAccount = {
  bank?: string;
  account?: number | string;
  image?: string | null;
  // QR display size in px (square). Undefined/null falls back to QR_DEFAULT_SIZE.
  qrSize?: number | null;
};

export type GiftData = {
  // The saved accounts, in the order guests swipe through them. Absent on
  // invitations saved before multi-account — read via giftAccounts(), which
  // migrates those on the fly.
  accounts?: GiftAccount[] | null;
  // ── Legacy single-account fields ──────────────────────────────────────────
  // Still written, mirrored from accounts[0], so canvas `eventBinding`s
  // ("moneyGift.image"), already-published invitations and the PHP records keep
  // working. Optional so the section can hold only the `enabled` flag before the
  // form is filled in — turning the toggle off never discards saved form data.
  bank?: string;
  account?: number | string;
  image?: string | null;
  // Every account's QR, in swipe order.
  images?: string[] | null;
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
// Maximum accounts a Money Gift section can hold. Each one carries its QR inline
// as a data URL, so the cap keeps the saved event payload a sane size.
export const GIFT_MAX_ACCOUNTS = 2;

/** A QR size the footer can actually render — the saved value clamped to the
 *  slider's range, with the default for anything missing or malformed. */
export function clampQrSize(size?: number | null): number {
  const n = typeof size === "number" && Number.isFinite(size) ? size : QR_DEFAULT_SIZE;
  return Math.min(QR_MAX_SIZE, Math.max(QR_MIN_SIZE, n));
}

/** The QR images to show, in swipe order. Reads the multi-image list and falls
 *  back to the legacy single `image` for invitations saved before multi-QR. */
export function giftQrImages(
  gift?: { image?: string | null; images?: (string | null)[] | null } | null,
): string[] {
  const list = (gift?.images ?? []).filter(
    (src): src is string => typeof src === "string" && src.length > 0,
  );
  if (list.length > 0) return list;
  return gift?.image ? [gift.image] : [];
}

const accountIsEmpty = (a: GiftAccount) =>
  !String(a.bank ?? "").trim() && !String(a.account ?? "").trim() && !a.image;

/**
 * The accounts to show, in swipe order — the one reader every surface uses
 * (footer, published page, live preview panel, editor sidebar).
 *
 * Invitations saved before multi-account hold a single bank/number plus up to
 * two QR images — two codes for that same account (e.g. DuitNow and the bank
 * app). Each of those becomes an account carrying that same bank and number, so
 * guests keep seeing exactly what they saw before.
 *
 * Blank entries are dropped: the editor keeps an empty card on screen while it
 * is being filled in, and that half-typed state must never reach a guest.
 */
export function giftAccounts(gift?: GiftData): GiftAccount[] {
  const saved = (gift?.accounts ?? []).filter(
    (a): a is GiftAccount => !!a && typeof a === "object",
  );
  const list = saved.length > 0 ? saved : legacyGiftAccounts(gift);
  return list
    .filter((a) => !accountIsEmpty(a))
    .slice(0, GIFT_MAX_ACCOUNTS)
    .map((a) => ({
      bank: a.bank ?? "",
      account: a.account ?? "",
      image: a.image ?? null,
      qrSize: clampQrSize(a.qrSize),
    }));
}

function legacyGiftAccounts(gift?: GiftData): GiftAccount[] {
  const base = { bank: gift?.bank, account: gift?.account, qrSize: gift?.qrSize };
  const images = giftQrImages(gift);
  if (images.length === 0) return [{ ...base, image: null }];
  return images.map((image) => ({ ...base, image }));
}

/** The legacy single-account fields, mirrored from the account list. Written on
 *  every save so older consumers keep reading a valid Money Gift. */
export function legacyGiftFields(accounts: GiftAccount[]) {
  const first = accounts[0];
  return {
    bank: first?.bank ?? "",
    account: first?.account ?? "",
    image: first?.image ?? null,
    images: accounts.map((a) => a.image).filter((src): src is string => !!src),
    qrSize: clampQrSize(first?.qrSize),
  };
}
/** A guest category, as stored by the PHP RSVP record's `pack_type` column.
 *  Free text: the host names the two options themselves ("Bride Family",
 *  "Colleagues", …) and the chosen label is submitted verbatim — it is not
 *  lowercased, slugged or mapped back to a fixed pair. */
export type PackType = string;

/** Longest guest-category label the PHP `pack_type` column accepts. */
export const PACK_TYPE_MAX_LENGTH = 100;

/** Labels used when a design has Guest Category on but no custom names — i.e.
 *  every invitation saved before the options became editable. */
export const PACK_TYPE_DEFAULT_OPTION_1 = "Family";
export const PACK_TYPE_DEFAULT_OPTION_2 = "Friends";

/** The two category labels to show, in order. One reader for every surface
 *  (public footer, live preview panel), so a blank or missing custom name
 *  always falls back to the original wording instead of rendering an empty
 *  button. Trimmed, since that is exactly what gets submitted as pack_type. */
export function packTypeOptions(
  rsvp?: { packTypeOption1?: string; packTypeOption2?: string } | null,
): [string, string] {
  return [
    rsvp?.packTypeOption1?.trim() || PACK_TYPE_DEFAULT_OPTION_1,
    rsvp?.packTypeOption2?.trim() || PACK_TYPE_DEFAULT_OPTION_2,
  ];
}

/** Which side of the celebration a guest belongs to, stored on the RSVP
 *  record's `guest_side` column. One level ABOVE the guest category: a guest
 *  answers this first ("Bride"), then the category ("Family"). Free text, like
 *  PackType — the host names the two sides and the chosen label is submitted
 *  verbatim, never lowercased, slugged or mapped. */
export type GuestSide = string;

/** Longest guest-side label the PHP `guest_side` column accepts. */
export const GUEST_SIDE_MAX_LENGTH = 100;

/** Labels used when a design has Guest Side on but no custom names. */
export const GUEST_SIDE_DEFAULT_OPTION_1 = "Bride";
export const GUEST_SIDE_DEFAULT_OPTION_2 = "Groom";

/** The two side labels to show, in order — the packTypeOptions() of Guest Side.
 *  One reader for every surface (public footer, live preview panel, sidebar
 *  placeholders), so a blank or missing custom name always falls back to the
 *  default wording instead of rendering an empty button. Trimmed, since that is
 *  exactly what gets submitted as guest_side. */
export function guestSideOptions(
  rsvp?: { guestSideOption1?: string; guestSideOption2?: string } | null,
): [string, string] {
  return [
    rsvp?.guestSideOption1?.trim() || GUEST_SIDE_DEFAULT_OPTION_1,
    rsvp?.guestSideOption2?.trim() || GUEST_SIDE_DEFAULT_OPTION_2,
  ];
}

/** A slot in the Guest Side x Guest Category grid: `s{side}c{category}`, both
 *  1-based. Keyed by POSITION, never by label, so renaming "Bride" to "Her
 *  Side" keeps the limit that was configured for it. */
export type MaxPaxComboKey = "s1c1" | "s1c2" | "s2c1" | "s2c2";

/** The four combinations, in the order the sidebar lists them. */
export const MAX_PAX_COMBO_KEYS: MaxPaxComboKey[] = ["s1c1", "s1c2", "s2c1", "s2c2"];

/** The slot id for a (side, category) pair, both 0-based as rendered. */
export function maxPaxComboKey(sideIndex: number, categoryIndex: number): MaxPaxComboKey | null {
  if (sideIndex !== 0 && sideIndex !== 1) return null;
  if (categoryIndex !== 0 && categoryIndex !== 1) return null;
  return `s${sideIndex + 1}c${categoryIndex + 1}` as MaxPaxComboKey;
}

/** Smallest max-pax a host can configure — a combination that allows nobody is
 *  not a limit, it is a disabled combination, which this feature does not have. */
export const MIN_MAX_PAX = 1;

/** The pax ceiling when nothing else is configured — the number every surface
 *  already fell back to before per-combination limits existed. */
export const DEFAULT_MAX_PAX = 3;

/** How many pax the guest may pick, for the combination they chose.
 *
 *  Falls back to Max Guest Capacity whenever a per-combination limit does not
 *  apply: either dimension turned off, an answer not yet given, or no override
 *  saved for that slot. That fallback is what keeps every invitation saved
 *  before this existed behaving exactly as it did — `maxPaxByCombo` is absent
 *  there, so every combination resolves to maxGuest. */
export function resolveMaxPax(
  rsvp?:
    | { maxGuest?: number; maxPaxByCombo?: Partial<Record<MaxPaxComboKey, number>> | null }
    | null,
  sideIndex?: number | null,
  categoryIndex?: number | null,
): number {
  const base = Math.floor(Number(rsvp?.maxGuest));
  const fallback = Number.isFinite(base) && base >= MIN_MAX_PAX ? base : DEFAULT_MAX_PAX;
  if (sideIndex == null || categoryIndex == null) return fallback;
  const key = maxPaxComboKey(sideIndex, categoryIndex);
  if (!key) return fallback;
  const override = Math.floor(Number(rsvp?.maxPaxByCombo?.[key]));
  return Number.isFinite(override) && override >= MIN_MAX_PAX ? override : fallback;
}

/** Longest custom RSVP wording the sidebar accepts. Generous enough for a
 *  sentence in any language, short enough to keep the card from overflowing. */
export const RSVP_TEXT_MAX_LENGTH = 160;

/** The wording every invitation shows unless the host types their own. Kept
 *  here so the footer, the live preview and the sidebar placeholders can never
 *  drift apart. */
export const RSVP_DEFAULT_TITLE = "RSVP";
export const RSVP_DEFAULT_QUESTION = "Will you attend the event?";
/** `{pax}` is substituted with the configured Max Guest Capacity, so the note
 *  keeps following the number even when the host rewrites the sentence. */
export const RSVP_PAX_TOKEN = "{pax}";
export const RSVP_DEFAULT_PAX_NOTE =
  `If more than ${RSVP_PAX_TOKEN} pax, please contact the family members.`;

/** The three pieces of RSVP wording to render, in one reader for every surface
 *  (public footer, live preview panel). A blank or missing custom string falls
 *  back to the original wording, so designs saved before the texts became
 *  editable read exactly as they were published. */
export function rsvpTexts(
  rsvp?: { title?: string; question?: string; paxNote?: string } | null,
  maxPax: number = 3,
): { title: string; question: string; paxNote: string } {
  return {
    title: rsvp?.title?.trim() || RSVP_DEFAULT_TITLE,
    question: rsvp?.question?.trim() || RSVP_DEFAULT_QUESTION,
    paxNote: (rsvp?.paxNote?.trim() || RSVP_DEFAULT_PAX_NOTE).split(RSVP_PAX_TOKEN).join(String(maxPax)),
  };
}

/** ── Footer card wording ───────────────────────────────────────────────────
 *
 * The headings guests read on the Contact / Money Gift / Location / Calendar
 * cards, plus the small note under the Money Gift heading.
 *
 * These live in their own section rather than inside `location` / `calendar` /
 * `moneyGift` because each of those is replaced wholesale on Save — and dropped
 * to `null` when its form is cleared (see LocationTab.commitAddress and
 * CalendarTab.handleDateChange). Wording has to survive that. It also keeps the
 * Calendar card heading clear of `calendar.title`, which is the EVENT title used
 * by the ICS / Google exports and the mini calendar.
 */

/** Longest heading the sidebar accepts — long enough for a phrase in any
 *  language, short enough to stay on one line of the card. */
export const CARD_TITLE_MAX_LENGTH = 60;
/** The Money Gift note is a sentence or two, so it gets its own, larger cap. */
export const GIFT_NOTE_MAX_LENGTH = 300;

export const CONTACT_DEFAULT_TITLE = "Contact";
export const GIFT_DEFAULT_TITLE = "Money Gift";
export const GIFT_DEFAULT_NOTE =
  "Your presence is the greatest gift of all. However, should you wish to honour us with a gift, a small contribution towards our future together would be sincerely appreciated.";
export const LOCATION_DEFAULT_TITLE = "Location";
export const CALENDAR_DEFAULT_TITLE = "Calendar";

/** Host-written wording. Every field is optional and a blank one means "use the
 *  default", which is what invitations saved before this existed do for all of
 *  them. */
export type CardTexts = {
  contactTitle?: string;
  giftTitle?: string;
  giftNote?: string;
  // Whether the note is shown under the Money Gift heading. Opt-in, so it is
  // OFF when undefined — invitations saved before it existed (and every new one
  // until the host turns it on) show the accounts alone, exactly as before.
  // Read it as `=== true`, never `!== false`.
  giftNoteEnabled?: boolean;
  locationTitle?: string;
  calendarTitle?: string;
} | null;

export type ResolvedCardTexts = {
  contactTitle: string;
  giftTitle: string;
  giftNote: string;
  /** False ⇒ don't render the note at all, whatever `giftNote` holds. */
  giftNoteEnabled: boolean;
  locationTitle: string;
  calendarTitle: string;
};

/** The wording to render, in one reader for every surface (public footer, live
 *  preview panel, sidebar placeholders) so they can never drift apart. */
export function resolveCardTexts(texts?: CardTexts): ResolvedCardTexts {
  return {
    contactTitle: texts?.contactTitle?.trim() || CONTACT_DEFAULT_TITLE,
    giftTitle: texts?.giftTitle?.trim() || GIFT_DEFAULT_TITLE,
    giftNote: texts?.giftNote?.trim() || GIFT_DEFAULT_NOTE,
    giftNoteEnabled: texts?.giftNoteEnabled === true,
    locationTitle: texts?.locationTitle?.trim() || LOCATION_DEFAULT_TITLE,
    calendarTitle: texts?.calendarTitle?.trim() || CALENDAR_DEFAULT_TITLE,
  };
}

export type RSVPConfig = {
  // Whether RSVP is available on the invitation. Treated as ON when undefined so
  // pre-existing designs (saved before this toggle existed) keep showing RSVP.
  enabled?: boolean;
  maxGuest?: number;
  // Whether guests are asked "Are you coming as?" when they accept. Unlike
  // `enabled`, this is OFF when undefined: it is an opt-in extra question, so
  // designs saved before it existed must keep the shorter form they were
  // published with. Read it as `=== true`, never `!== false`.
  packTypeEnabled?: boolean;
  // The two category names the host chose, submitted verbatim as pack_type.
  // Absent on designs saved before the labels became editable — which is why
  // every consumer reads them through packTypeOptions() instead of directly,
  // so those keep showing Family / Friends.
  packTypeOption1?: string;
  packTypeOption2?: string;
  // Whether accepting guests are asked which side they belong to BEFORE the
  // guest category ("Bride" then "Family"). Opt-in exactly like packTypeEnabled:
  // OFF when undefined, so invitations saved before Guest Side existed keep the
  // form they were published with. Read it as `=== true`, never `!== false`.
  guestSideEnabled?: boolean;
  // The two side names the host chose, submitted verbatim as guest_side and
  // kept SEPARATE from pack_type ("Bride" + "Family", never "Bride Family").
  // Absent on older designs — read through guestSideOptions() for the fallback.
  guestSideOption1?: string;
  guestSideOption2?: string;
  // Optional per-combination pax ceilings, keyed by grid position (see
  // MaxPaxComboKey). Absent or blank for a slot ⇒ that combination uses
  // maxGuest, which is what every invitation saved before this existed does.
  maxPaxByCombo?: Partial<Record<MaxPaxComboKey, number>> | null;
  // Host-written RSVP wording: the card heading, the question under it, and the
  // note beside the pax dropdown (where `{pax}` stands in for maxGuest). Blank
  // or absent ⇒ the default wording, so nothing changes for older designs —
  // read them through rsvpTexts() rather than directly.
  title?: string;
  question?: string;
  paxNote?: string;
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
  // Host-written headings for the footer cards (see resolveCardTexts).
  cardTexts: CardTexts;
};

export type EventSection = keyof EventData;

const DEFAULT_EVENT_DATA: EventData = {
  contacts: [],
  location: null,
  calendar: null,
  moneyGift: null,
  rsvpConfig: null,
  cardTexts: null,
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
