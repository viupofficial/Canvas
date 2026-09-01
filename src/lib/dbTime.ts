// Parsing for the bare "YYYY-MM-DD HH:MM:SS" timestamps the vi-up.com PHP APIs
// return (designs.updated_at / last_modified, events, …).
//
// Those strings carry NO timezone, and the iFastNet box does not run on UTC —
// it runs on America/New_York. Observed 2026-09-01: a save made at 14:48 UTC
// was stored as "10:44:07" (UTC−4) while the HTTP Date header read 14:48 GMT.
//
// Passing such a string straight to `new Date()` makes the browser read it as
// LOCAL time, so a design saved seconds ago showed up as "Edited 12 hr ago" for
// a UTC+8 viewer (−4 server vs +8 client = 12h skew). Everything here converts
// the naive string from the server's zone to a real epoch first.
//
// The Date response header would tell us the server clock directly, but it is
// not a CORS-safelisted response header and PHP does not expose it, so the zone
// below is the source of truth. If the host ever moves, override it via
// NEXT_PUBLIC_VIUP_DB_TIMEZONE instead of editing this file — DST is handled
// automatically because the offset is resolved per-instant, not hardcoded.

const SERVER_TIMEZONE =
  process.env.NEXT_PUBLIC_VIUP_DB_TIMEZONE || "America/New_York";

// Offset (ms) of SERVER_TIMEZONE at a given instant: +ve east of UTC.
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instantMs));

    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");

    // Re-read the zone's wall clock as if it were UTC; the gap is the offset.
    const asIfUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    return asIfUtc - instantMs;
  } catch {
    // Unknown zone id / no ICU data — fall back to "no conversion".
    return 0;
  }
}

/**
 * Parse a PHP/MySQL timestamp into epoch milliseconds.
 *
 * Strings that already declare a zone ("…Z", "…+08:00") are trusted as-is;
 * bare ones are interpreted in the server's timezone.
 * Returns null for empty/unparseable input.
 */
export function parseDbTime(value?: string | null): number | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str || str.startsWith("0000-00-00")) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(str);
  if (!m) {
    const loose = Date.parse(str);
    return Number.isFinite(loose) ? loose : null;
  }

  // An explicit zone after the time part means the string is already absolute.
  const tail = str.slice(m[0].length);
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(tail.trim())) {
    const abs = Date.parse(str.includes("T") ? str : str.replace(" ", "T"));
    return Number.isFinite(abs) ? abs : null;
  }

  const naiveAsUtc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? "0"),
  );
  if (!Number.isFinite(naiveAsUtc)) return null;

  // Two passes: the first offset guess can land on the wrong side of a DST
  // switch, the second re-resolves it at the corrected instant.
  let epoch = naiveAsUtc - zoneOffsetMs(naiveAsUtc, SERVER_TIMEZONE);
  epoch = naiveAsUtc - zoneOffsetMs(epoch, SERVER_TIMEZONE);
  return epoch;
}

/** Human "Edited …" label for a design row's timestamp. */
export function formatEdited(value?: string | null): string {
  const then = parseDbTime(value);
  if (then == null) return "";

  // Clock skew between the two machines can put a fresh save slightly in the
  // future; clamp so it reads "just now" rather than a negative duration.
  const min = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (min < 1) return "Edited just now";
  if (min < 60) return `Edited ${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Edited ${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Edited ${day} day${day > 1 ? "s" : ""} ago`;
  return `Edited ${new Date(then).toLocaleDateString()}`;
}
