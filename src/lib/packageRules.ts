// Single source of truth for purchased-package feature gating in the canvas app.
//
// PHP (api/get_user.php) returns `event.package_id`:
//   1 = Basic, 2 = Standard, 3 = Premium, null/undefined = old/default event.
//
// Basic hides RSVP + Money Gift everywhere and caps the photo gallery (4),
// location changes (3) and music changes (2). Standard caps the gallery at 8
// but has no location/music limits. Premium and null/legacy events get full
// access. Everything that gates a package feature — sidebar, preview, bottom
// nav, published card, gallery/location/music handlers — reads its rules from
// here so the behaviour stays consistent across every surface.

export type PackageId = 1 | 2 | 3 | null;

export type PackageRules = {
  // Normalised package id (null for old/default events or a missing column).
  packageId: number | null;
  isBasicPackage: boolean;
  isStandardPackage: boolean;
  isPremiumPackage: boolean;
  // RSVP + Money Gift are shown for every tier EXCEPT Basic.
  showRsvpAndMoneyGift: boolean;
  // Max images allowed on the photo gallery page (Infinity ⇒ unlimited).
  galleryLimit: number;
  // Max number of location changes (Infinity ⇒ unlimited).
  locationChangeLimit: number;
  // Max number of music changes (Infinity ⇒ unlimited).
  musicChangeLimit: number;
};

// Derive the rule set from a raw package_id value (number | string | null |
// undefined). Anything that isn't 1/2/3 is treated as full access.
export function getPackageRules(rawPackageId: unknown): PackageRules {
  const packageId = rawPackageId == null ? null : Number(rawPackageId);

  const isBasicPackage = packageId === 1;
  const isStandardPackage = packageId === 2;
  const isPremiumPackage = packageId === 3;

  return {
    packageId: Number.isFinite(packageId as number) ? (packageId as number) : null,
    isBasicPackage,
    isStandardPackage,
    isPremiumPackage,
    showRsvpAndMoneyGift: !isBasicPackage,
    galleryLimit: isBasicPackage ? 4 : isStandardPackage ? 8 : Infinity,
    locationChangeLimit: isBasicPackage ? 3 : Infinity,
    musicChangeLimit: isBasicPackage ? 2 : Infinity,
  };
}

// ── Feature-usage counters (persisted inside designs.json_data) ──────────────
// These live in the saved canvas JSON — NOT the events table — so they travel
// with the design record. Only actual, successful changes increment them.
//
// Location + music are RATE-LIMITED counters: each holds a count and the ISO
// timestamp the current 24-hour window started. Once the window is older than
// 24h the count resets. The gallery limit is NOT time-based (it caps the number
// of photos on the page) and is enforced separately — it has no counter here.
export type UsageCounter = {
  count: number;
  // ISO timestamp of when the current 24-hour window opened. null ⇒ no window
  // yet (first use opens one).
  windowStartedAt: string | null;
};

export type FeatureUsage = {
  location: UsageCounter;
  music: UsageCounter;
};

export const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const EMPTY_FEATURE_USAGE: FeatureUsage = {
  location: { count: 0, windowStartedAt: null },
  music: { count: 0, windowStartedAt: null },
};

// Resolve a counter's EFFECTIVE state for `now`, applying the 24-hour reset:
//  - no window yet            → fresh window starting now, count 0
//  - window older than 24h    → new window starting now, count 0
//  - window still within 24h  → keep the stored count + window
// Pure: pass the same `now` when you need read + write to agree.
export function normalizeUsageCounter(
  counter: Partial<UsageCounter> | undefined,
  now: Date = new Date(),
): UsageCounter {
  if (!counter?.windowStartedAt) {
    return { count: 0, windowStartedAt: now.toISOString() };
  }

  const startedAt = new Date(counter.windowStartedAt).getTime();
  const nowTime = now.getTime();

  if (!Number.isFinite(startedAt) || nowTime - startedAt >= USAGE_WINDOW_MS) {
    return { count: 0, windowStartedAt: now.toISOString() };
  }

  const count = Math.floor(Number(counter.count ?? 0));
  return {
    count: Number.isFinite(count) && count > 0 ? count : 0,
    windowStartedAt: counter.windowStartedAt,
  };
}

// Read the stored counters as-is (no reset applied — that happens on use via
// normalizeUsageCounter). Tolerates missing/older shapes by falling back to an
// empty counter.
export function readFeatureUsage(jsonData: any): FeatureUsage {
  const raw = jsonData?.featureUsage ?? {};
  const readCounter = (c: any): UsageCounter => {
    const n = Math.floor(Number(c?.count));
    return {
      count: Number.isFinite(n) && n > 0 ? n : 0,
      windowStartedAt:
        typeof c?.windowStartedAt === "string" ? c.windowStartedAt : null,
    };
  };
  return {
    location: readCounter(raw.location),
    music: readCounter(raw.music),
  };
}

// ── Upgrade messages ─────────────────────────────────────────────────────────
// Shared copy so the toast and the inline sidebar note stay in sync.
export const UPGRADE_MESSAGES = {
  gallery: (limit: number) =>
    `Your current package allows up to ${limit} photos. Upgrade to add more.`,
  galleryBasicSidebar: "Basic package allows up to 4 photos. Upgrade to add more.",
  galleryStandardSidebar: "Standard package allows up to 8 photos. Upgrade to add more.",
  location:
    "You have used all 3 location changes for this 24-hour period. Upgrade to change more.",
  locationRemaining: (remaining: number) =>
    `Basic package: ${remaining}/3 location changes left in this 24-hour period.`,
  music:
    "You have used all 2 music changes for this 24-hour period. Upgrade to change more.",
  musicRemaining: (remaining: number) =>
    `Basic package: ${remaining}/2 music changes left in this 24-hour period.`,
} as const;
