// Helpers for background-music sources. Music can be a regular audio file
// (uploaded → served from Vercel Blob) or a YouTube link, which needs an embed
// iframe instead of an <audio> element.

const VALID_ID = /^[a-zA-Z0-9_-]{11}$/;

// Extract the 11-char video id from any common YouTube URL shape, or null if
// the input isn't a YouTube link. Accepts a bare id too.
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = url.trim();

  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return VALID_ID.test(id) ? id : null;
    }

    // youtube.com / music.youtube.com / m.youtube.com
    if (host === "youtube.com" || host === "music.youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && VALID_ID.test(v)) return v;

      // /embed/<id>, /shorts/<id>, /v/<id>
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "v");
      if (idx >= 0 && parts[idx + 1] && VALID_ID.test(parts[idx + 1])) {
        return parts[idx + 1];
      }
    }
  } catch {
    // Not a URL — maybe the user pasted a bare video id.
    if (VALID_ID.test(raw)) return raw;
  }
  return null;
}

export function isYouTubeUrl(url: string | null | undefined): boolean {
  return parseYouTubeId(url) !== null;
}

// Build a YouTube embed URL that loops a single video. `loop=1` only works when
// `playlist` is set to the same id. autoplay is gated so we can start playback
// after a user gesture (the envelope seal click), which browsers require for
// audible autoplay.
export function youTubeEmbedUrl(id: string, opts: { autoplay?: boolean } = {}): string {
  const params = new URLSearchParams({
    autoplay: opts.autoplay ? "1" : "0",
    loop: "1",
    playlist: id,
    controls: "1",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}
