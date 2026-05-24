import {
  CalendarExportInput,
  formatIcsDate,
  normalizeCalendarEvent,
} from "./normalizeEvent";

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildIcs(input: CalendarExportInput): string | null {
  const ev = normalizeCalendarEvent(input);
  if (!ev) return null;

  const uid = `${ev.start.getTime()}-${Math.random().toString(36).slice(2, 10)}@vi-up`;
  const dtstamp = formatIcsDate(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//vi-up//calendar export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatIcsDate(ev.start)}`,
    `DTEND:${formatIcsDate(ev.end)}`,
    `SUMMARY:${escapeIcsText(ev.title)}`,
  ];

  if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);

  if (ev.reminderMinutes !== null) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(ev.title)}`,
      `TRIGGER:-PT${ev.reminderMinutes}M`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function icsFilename(title: string | null | undefined): string {
  const base = (title || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "event";
  return `${base}.ics`;
}
