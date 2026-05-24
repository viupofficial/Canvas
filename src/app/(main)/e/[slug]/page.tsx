import { notFound } from "next/navigation";
import { list } from "@vercel/blob";
import EventFooter from "@/src/components/EventFooter";
import RsvpPlayer from "@/src/components/RsvpPlayer";
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

  return (
    <main>
      <RsvpPlayer
        pages={data.pages ?? []}
        envelope={data.envelope ?? null}
        musicUrl={data.musicUrl ?? null}
        borderUrl={data.borderUrl ?? null}
      />
      <EventFooter
        contacts={data.contacts ?? []}
        moneyGift={data.moneyGift ?? null}
        calendar={data.calendar ?? null}
        location={data.location ?? null}
        rsvpConfig={data.rsvpConfig ?? null}
      />
    </main>
  );
}
