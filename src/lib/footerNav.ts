/**
 * Single source of truth for which items the invitation footer shows.
 *
 * Every surface — the editor's in-canvas footer, the local preview, the
 * published /e/[slug] page — renders the same <EventFooter/>, and EventFooter
 * derives its layout from this one function. There is no second copy of these
 * rules to drift out of sync, so the editor preview and the published
 * invitation cannot disagree.
 *
 * The footer has two icon groups flanking the centred RSVP circle:
 *
 *     [ Guestbook   leftSlot ]   (RSVP)   [ rightSlot   Contact ]
 *
 * Guestbook and Contact are fixed. The two slots are filled from three
 * visibility toggles (Money Gift, Calendar, Location), each stored on its own
 * event-data section and treated as ON unless explicitly `false`, so events
 * saved before the toggles existed keep every feature.
 *
 *   Money Gift ON  → left = Money Gift, right = Info / Calendar / Location
 *   Money Gift OFF → left = Calendar,   right = Location  (no Info at all)
 *
 * Package rules outrank the toggles: a package that doesn't include Money Gift
 * (Basic) can never show it, whatever the toggle says.
 */

export type InfoMode = "info" | "calendar" | "location" | "hidden";
export type LeftSlot = "moneyGift" | "calendar" | null;
export type RightSlot = "info" | "calendar" | "location" | null;

export type FooterNavInput = {
  /** Package gate — false for tiers that don't include Money Gift (Basic). */
  moneyGiftAllowed: boolean;
  /** `enabled` from eventData.moneyGift / .calendar / .location. */
  moneyGiftEnabled?: boolean;
  calendarEnabled?: boolean;
  locationEnabled?: boolean;
};

export type FooterNav = {
  /** Feature is available to guests (toggle ON, and allowed by the package). */
  moneyGiftVisible: boolean;
  calendarVisible: boolean;
  locationVisible: boolean;
  /** What the Calendar/Location pair collapses to when Money Gift holds the
   *  left slot. Only "info" renders the expandable Info button. */
  infoMode: InfoMode;
  leftSlot: LeftSlot;
  rightSlot: RightSlot;
  /** True when the Info button (and its two-bubble expansion) is on screen. */
  showInfoButton: boolean;
  /** A slot came up empty, so its group is down to a single item. The footer
   *  re-anchors both groups to the bar's edges in this state instead of
   *  leaving a hole where the missing item used to be. */
  compact: boolean;
};

/** Toggles default to ON: only an explicit `false` hides a feature. */
const on = (v?: boolean) => v !== false;

export function computeFooterNav(input: FooterNavInput): FooterNav {
  const moneyGiftVisible = input.moneyGiftAllowed && on(input.moneyGiftEnabled);
  const calendarVisible = on(input.calendarEnabled);
  const locationVisible = on(input.locationEnabled);

  const infoMode: InfoMode =
    calendarVisible && locationVisible
      ? "info"
      : calendarVisible
        ? "calendar"
        : locationVisible
          ? "location"
          : "hidden";

  // With Money Gift present the two features share one slot (Info, or whichever
  // single one is on). Without it they split the two freed slots, and the Info
  // chooser is never used — each button opens its own popup directly.
  const leftSlot: LeftSlot = moneyGiftVisible
    ? "moneyGift"
    : calendarVisible
      ? "calendar"
      : null;

  const rightSlot: RightSlot = moneyGiftVisible
    ? infoMode === "hidden"
      ? null
      : infoMode
    : locationVisible
      ? "location"
      : null;

  return {
    moneyGiftVisible,
    calendarVisible,
    locationVisible,
    infoMode,
    leftSlot,
    rightSlot,
    showInfoButton: rightSlot === "info",
    compact: leftSlot === null || rightSlot === null,
  };
}
