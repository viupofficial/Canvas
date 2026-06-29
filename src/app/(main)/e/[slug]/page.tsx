import { notFound } from "next/navigation";
import { list } from "@vercel/blob";
import EventPageClient from "@/src/components/EventPageClient";
import "../../../globals.css";

export const dynamic = "force-dynamic";

async function loadEvent(slug: string) {
  const { blobs } = await list({
    prefix: `events/${slug}.json`,
    limit: 1,
    token: process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN,
  });
  const match = blobs.find((b) => b.pathname === `events/${slug}.json`);
  if (!match) return null;
  const res = await fetch(match.url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadEvent(slug);
  if (!data) notFound();

  // EventPageClient renders the shared PreviewShell, which provides its own
  // top-level <main className="preview-local"> — matching /preview-local exactly.
  return <EventPageClient data={data} />;
}
