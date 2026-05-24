// Normalizes calendar export inputs from existing EventData shape.
// All new fields are optional — pre-existing `{ date }`-only records still work.

export type CalendarExportInput = {
  date?: string | null;
  endDate?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  reminderMinutes?: number | null;
};

export type NormalizedCalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  location: string;
  description: string;
  reminderMinutes: number | null;
};

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export function normalizeCalendarEvent(
  input: CalendarExportInput,
): NormalizedCalendarEvent | null {
  if (!input?.date) return null;
  const start = new Date(input.date);
  if (isNaN(start.getTime())) return null;

  let end: Date;
  if (input.endDate) {
    const parsed = new Date(input.endDate);
    end = isNaN(parsed.getTime())
      ? new Date(start.getTime() + DEFAULT_DURATION_MS)
      : parsed;
  } else {
    end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  }

  return {
    title: input.title?.trim() || "Event",
    start,
    end,
    location: input.location?.trim() || "",
    description: input.description?.trim() || "",
    reminderMinutes:
      typeof input.reminderMinutes === "number" && input.reminderMinutes > 0
        ? Math.round(input.reminderMinutes)
        : null,
  };
}

export function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}
