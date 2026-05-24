import { NextRequest, NextResponse } from "next/server";
import { buildIcs, icsFilename } from "@/src/lib/calendar/icsBuilder";

export const runtime = "nodejs";

// GET /api/calendar/ics?date=...&endDate=...&title=...&description=...&location=...&reminderMinutes=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "missing 'date'" }, { status: 400 });
  }

  const reminderRaw = searchParams.get("reminderMinutes");
  const reminderMinutes = reminderRaw ? Number(reminderRaw) : null;

  const ics = buildIcs({
    date,
    endDate: searchParams.get("endDate"),
    title: searchParams.get("title"),
    description: searchParams.get("description"),
    location: searchParams.get("location"),
    reminderMinutes: Number.isFinite(reminderMinutes as number)
      ? (reminderMinutes as number)
      : null,
  });

  if (!ics) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(searchParams.get("title"))}"`,
      "Cache-Control": "no-store",
    },
  });
}
