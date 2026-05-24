import {
  CalendarExportInput,
  formatIcsDate,
  normalizeCalendarEvent,
} from "./normalizeEvent";

// NOTE: this only opens Google Calendar with the event prefilled.
// The user still clicks Save in Google's UI to actually create the event.
// Custom reminders cannot be forced through this URL — that requires OAuth.
export function buildGoogleCalendarLink(input: CalendarExportInput): string | null {
  const ev = normalizeCalendarEvent(input);
  if (!ev) return null;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${formatIcsDate(ev.start)}/${formatIcsDate(ev.end)}`,
  });
  if (ev.description) params.set("details", ev.description);
  if (ev.location) params.set("location", ev.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
