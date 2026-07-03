"use client"

import React from "react";
import { parseCalendarDate } from "@/src/lib/calendar/googleCalendarEmbed";

// Self-rendered month calendar for the Info → Calendar popup. Replaces the
// Google Calendar embed, which is cross-origin and can only display events
// that exist inside the backing Google calendar — meaning it could never
// highlight the selected day or show the sidebar title on it. This grid is
// driven entirely by the saved calendar state, so the selected date is
// pinned with the event title in both editor preview and live preview.
export default function EventMiniCalendar({
  date,
  title,
}: {
  date?: string | null;
  title?: string | null;
}) {
  const parsed = parseCalendarDate(date);
  // No/invalid date ⇒ show the current month with nothing pinned.
  const now = new Date();
  const year = parsed?.year ?? now.getFullYear();
  const month = (parsed?.month ?? now.getMonth() + 1) - 1; // 0-based
  const selectedDay = parsed?.day ?? null;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  // Monday-first offset, matching the Google embed's MON…SUN layout.
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;

  type Cell = { day: number; inMonth: boolean };
  const cells: Cell[] = [];
  for (let i = leading - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay++, inMonth: false });
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const accent = "#7D5B59";
  const eventTitle = title?.trim() || "";

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "350px",
        fontFamily: "Montserrat",
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        padding: "12px",
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontSize: "15px",
          fontWeight: 600,
          paddingBottom: "10px",
          color: "#3c3c3c",
        }}
      >
        {monthLabel}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          rowGap: "2px",
        }}
      >
        {weekdays.map((w) => (
          <div
            key={w}
            style={{
              textAlign: "center",
              fontSize: "9px",
              fontWeight: 600,
              color: "#9a9a9a",
              paddingBottom: "6px",
            }}
          >
            {w}
          </div>
        ))}

        {cells.map((c, i) => {
          const isSelected = c.inMonth && selectedDay === c.day;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minHeight: "40px",
                paddingTop: "2px",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  fontSize: "12px",
                  fontWeight: isSelected ? 700 : 400,
                  color: isSelected ? "#fff" : c.inMonth ? "#3c3c3c" : "#c8c8c8",
                  background: isSelected ? accent : "transparent",
                }}
              >
                {c.day}
              </span>
              {isSelected && eventTitle && (
                <span
                  style={{
                    maxWidth: "100%",
                    fontSize: "7.5px",
                    fontWeight: 600,
                    color: accent,
                    background: "#7D5B591A",
                    borderRadius: "3px",
                    padding: "1px 3px",
                    marginTop: "2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={eventTitle}
                >
                  {eventTitle}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
