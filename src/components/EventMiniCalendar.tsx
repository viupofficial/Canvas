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
  startTime,
  endTime,
  address,
}: {
  date?: string | null;
  title?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  address?: string | null;
}) {
  const parsed = parseCalendarDate(date);
  // No/invalid date ⇒ show the current month with nothing pinned.
  const now = new Date();
  const year = parsed?.year ?? now.getFullYear();
  const month = (parsed?.month ?? now.getMonth() + 1) - 1; // 0-based
  const selectedDay = parsed?.day ?? null;

  // Google-Calendar-style detail card, opened by tapping the pinned day. The
  // day chip only ever shows a truncated title so long titles can't stretch
  // their grid column; the full text lives here.
  const [showDetails, setShowDetails] = React.useState(false);

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
  const hasEvent = selectedDay !== null;

  const longDate =
    selectedDay !== null
      ? new Date(year, month, selectedDay).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
  const timeRange = [startTime?.trim(), endTime?.trim()]
    .filter(Boolean)
    .join(" – ");

  return (
    <div
      style={{
        position: "relative",
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
              // minWidth:0 stops a long title chip from widening its 1fr column
              // (grid items default to min-width:auto), which used to blow the
              // day columns out of alignment.
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minWidth: 0,
                minHeight: "40px",
                paddingTop: "2px",
                cursor: isSelected ? "pointer" : "default",
              }}
              onClick={isSelected ? () => setShowDetails(true) : undefined}
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
                    display: "block",
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

      {/* Tap-the-day detail card: the full title and time, unclipped. */}
      {showDetails && hasEvent && (
        <div
          onClick={() => setShowDetails(false)}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px",
            background: "rgba(0,0,0,0.08)",
            borderRadius: "8px",
            boxSizing: "border-box",
            zIndex: 5,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "100%",
              overflowY: "auto",
              background: "#fff",
              borderRadius: "10px",
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
              padding: "14px 14px 16px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                aria-label="Close event details"
                onClick={() => setShowDetails(false)}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "16px",
                  lineHeight: 1,
                  color: "#7a7a7a",
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <span
                style={{
                  flex: "0 0 auto",
                  width: "12px",
                  height: "12px",
                  borderRadius: "3px",
                  background: accent,
                  marginTop: "5px",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#3c3c3c",
                    lineHeight: 1.3,
                    overflowWrap: "anywhere",
                  }}
                >
                  {eventTitle || "Event"}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b6b6b",
                    marginTop: "4px",
                    overflowWrap: "anywhere",
                  }}
                >
                  {longDate}
                  {timeRange ? ` · ${timeRange}` : ""}
                </div>
                {address?.trim() && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b6b6b",
                      marginTop: "4px",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {address}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
