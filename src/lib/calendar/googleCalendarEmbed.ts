// Google Calendar EMBED iframe helpers (distinct from googleCalendarLink.ts,
// which builds the "Add to Google Calendar" TEMPLATE link).
//
// The embed is cross-origin, so the page can never reach into the iframe to
// change its internal header (do NOT try iframe.contentWindow). Instead the
// URL hides Google's own title bar (`showTitle=0`) and callers render their
// own header from the saved calendar state.

export type CalendarEmbedInput = {
  title?: string | null;
  // "YYYY-MM-DD" (native <input type="date">) or "DD/MM/YYYY"
  date?: string | null;
};

// Public Google calendar backing the embed grid. Its internal name
// ("Wedding Maya x Asyraaf") is not controllable from here — see showTitle=0.
const EMBED_CALENDAR_ID =
  "ddefc266bd7c7842321350b3a6d56e76494d5e4cc97846120d26541d4c141c20@group.calendar.google.com";
const EMBED_TIMEZONE = "Asia/Kuala_Lumpur";

// Parses "DD/MM/YYYY" or "YYYY-MM-DD" (native <input type="date">) into
// numeric parts. Returns null for anything that isn't a real calendar date.
export function parseCalendarDate(
  dateString?: string | null,
): { year: number; month: number; day: number } | null {
  if (!dateString) return null;
  const s = dateString.trim();

  let y: number, m: number, d: number;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else if (ymd) {
    y = Number(ymd[1]);
    m = Number(ymd[2]);
    d = Number(ymd[3]);
  } else {
    const parsed = new Date(s);
    if (isNaN(parsed.getTime())) return null;
    y = parsed.getFullYear();
    m = parsed.getMonth() + 1;
    d = parsed.getDate();
  }

  // Reject impossible dates like 31/02 by round-tripping through Date.
  const check = new Date(y, m - 1, d);
  if (
    check.getFullYear() !== y ||
    check.getMonth() !== m - 1 ||
    check.getDate() !== d
  ) {
    return null;
  }

  return { year: y, month: m, day: d };
}

// DD/MM/YYYY or YYYY-MM-DD → YYYYMMDD for the embed's `dates=` param.
export function formatDateForGoogle(dateString?: string | null): string | null {
  const parts = parseCalendarDate(dateString);
  if (!parts) return null;
  const pad = (n: number, len: number) => String(n).padStart(len, "0");
  return `${pad(parts.year, 4)}${pad(parts.month, 2)}${pad(parts.day, 2)}`;
}

// Builds the iframe src from the current calendar state. `dates=YYYYMMDD/YYYYMMDD`
// navigates the embed to the selected day's month; mode=MONTH keeps the grid view.
export function buildGoogleCalendarEmbedUrl(
  calendarData?: CalendarEmbedInput | null,
): string {
  const params = [
    `src=${encodeURIComponent(EMBED_CALENDAR_ID)}`,
    `ctz=${encodeURIComponent(EMBED_TIMEZONE)}`,
    "showTitle=0",
    "mode=MONTH",
  ];
  const ymd = formatDateForGoogle(calendarData?.date);
  if (ymd) params.push(`dates=${encodeURIComponent(`${ymd}/${ymd}`)}`);
  return `https://calendar.google.com/calendar/embed?${params.join("&")}`;
}
