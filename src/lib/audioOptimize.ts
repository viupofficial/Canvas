// Shrink uploaded background music before it is streamed to blob storage.
//
// Why: most users upload a full-length 256/320kbps MP3 (6-10MB) as the
// background track for an invitation that is opened on mobile data. Re-encoding
// it at a bitrate appropriate for background music typically cuts 50-70% off
// the transfer with no audible difference through a phone speaker.
//
// Why MP3 out, not Opus/AAC: the output format has to play on every phone a
// guest might open an invite with, and it has to keep working alongside the
// URLs already stored in existing events. MP3 is the only format that is both
// universally decodable (iOS Safari included, no version caveats) and identical
// to what the pipeline already stores — so nothing downstream (MusicPlayer, the
// public /e/[slug] page, saved canvas JSON) has to change or learn a new case.
// A smaller-but-patchier codec would trade reliability for bytes; reliability
// wins for something a guest gets one chance to open.
//
// This module is dynamically imported from the upload handler ONLY, so neither
// the encoder nor this file is part of the Canvas' initial bundle, and nothing
// here runs during rendering, autosave, preview or public playback.
//
// IMPORTANT: this path is for UPLOADED FILES ONLY. YouTube music is a URL that
// never reaches this module — see addMusicFromUrl in CanvasEditor.

/** Mirrors maximumSizeInBytes in /api/upload-music. */
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

// Target bitrates. 128kbps stereo is the long-standing "sounds fine" point for
// consumer music and is well above where background music starts to audibly
// suffer; mono needs less for the same perceived quality.
const TARGET_KBPS_STEREO = 128;
const TARGET_KBPS_MONO = 96;

// Sources already at or below this are left alone: re-encoding them would add a
// lossy generation for little or no size win.
const MIN_SOURCE_KBPS = 160;

// Small files aren't worth a decode/encode cycle.
const SKIP_BYTES = 1.5 * 1024 * 1024;

// Guards against pathological inputs (DJ sets, audiobooks): decoding holds the
// whole track as float PCM, which is ~10MB per minute of stereo 44.1kHz.
const MAX_DURATION_SEC = 12 * 60;

// If encoding is still running after this, give up and upload the original
// rather than making the user wait. Optimization is a bonus, never a gate.
const TIME_BUDGET_MS = 45_000;

// Sample rates LAME can encode. Anything else is resampled to 44.1kHz first.
const LAME_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
const FALLBACK_RATE = 44100;

const SAMPLES_PER_BLOCK = 1152; // one MP3 frame
const BLOCKS_PER_SLICE = 64; // ~1.7s of audio between yields to the event loop

const AUDIO_EXTENSIONS = [
  ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus",
  ".flac", ".weba", ".webm", ".mp4", ".aif", ".aiff", ".wma",
];

export type AudioOptimizeResult = {
  /** The file to upload: the optimized copy, or the untouched original. */
  file: File;
  optimized: boolean;
  originalBytes: number;
  outputBytes: number;
  /** Why optimization was skipped (diagnostics only; never shown as an error). */
  skipReason?: string;
};

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Validation for a picked music file. Returns an error message, or null when
 * the file is acceptable.
 *
 * Deliberately permissive about MIME type: browsers report MP3s as audio/mpeg,
 * audio/mp3 or (on some Windows/Android combinations) nothing at all, so a
 * blank or generic type is accepted when the extension is a known audio one.
 * This mirrors the allowedContentTypes list the upload token already permits.
 */
export function validateAudioFile(file: File): string | null {
  if (file.size === 0) return "That file is empty — please pick another track.";
  if (file.size > MAX_AUDIO_BYTES) {
    return `That file is ${formatBytes(file.size)}. Please use a track under ${formatBytes(MAX_AUDIO_BYTES)}.`;
  }

  const type = (file.type || "").toLowerCase();
  if (type.startsWith("audio/")) return null;

  // Generic/empty types are only trusted when the extension backs them up, so
  // the filename alone is never the deciding factor.
  const generic =
    type === "" ||
    type === "application/octet-stream" ||
    type === "application/ogg" ||
    type === "video/mp4";
  const name = (file.name || "").toLowerCase();
  const knownExt = AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (generic && knownExt) return null;

  return "That doesn't look like an audio file — please pick an MP3 or similar.";
}

// Safari still ships the prefixed constructors; both spellings are optional.
type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  OfflineAudioContext?: typeof OfflineAudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

function makeAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

// Safari returned void + callbacks from decodeAudioData long after other
// browsers moved to a promise, and still accepts both shapes. Support each.
function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (buf: AudioBuffer) => {
      if (!settled) {
        settled = true;
        resolve(buf);
      }
    };
    const fail = (err: unknown) => {
      if (!settled) {
        settled = true;
        reject(err ?? new Error("decode failed"));
      }
    };
    try {
      const maybe = ctx.decodeAudioData(data, ok, fail) as unknown as
        | Promise<AudioBuffer>
        | undefined;
      if (maybe && typeof maybe.then === "function") maybe.then(ok, fail);
    } catch (err) {
      fail(err);
    }
  });
}

/** Resample to a rate LAME accepts. Only runs for unusual source rates. */
async function resample(buffer: AudioBuffer, channels: number): Promise<AudioBuffer> {
  const w = window as AudioWindow;
  const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctor) throw new Error("no OfflineAudioContext");
  const frames = Math.ceil(buffer.duration * FALLBACK_RATE);
  const offline = new Ctor(channels, frames, FALLBACK_RATE);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

function toInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = input[i] < -1 ? -1 : input[i] > 1 ? 1 : input[i];
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Returns a smaller MP3 copy of the file when that is worth doing, and the
 * ORIGINAL FILE UNCHANGED in every other case — small input, already-efficient
 * input, unsupported browser, decode/encode error, or a bigger result. Never
 * throws, so a valid wedding song is never rejected by optional compression.
 */
export async function optimizeAudioFile(file: File): Promise<AudioOptimizeResult> {
  const originalBytes = file.size;
  const pass = (skipReason: string): AudioOptimizeResult => ({
    file,
    optimized: false,
    originalBytes,
    outputBytes: originalBytes,
    skipReason,
  });

  if (originalBytes <= SKIP_BYTES) return pass("already small");

  const ctx = makeAudioContext();
  if (!ctx) return pass("no Web Audio support");

  try {
    const decoded = await decode(ctx, await file.arrayBuffer());

    if (!decoded.duration || !decoded.length) return pass("empty audio");
    if (decoded.duration > MAX_DURATION_SEC) return pass("track too long");

    // A source already at a modest bitrate gains nothing from another lossy
    // pass. (An uncompressed WAV is ~1400kbps, so it clears this easily.)
    const sourceKbps = (originalBytes * 8) / decoded.duration / 1000;
    if (sourceKbps <= MIN_SOURCE_KBPS) return pass("already efficient");

    const channels = Math.min(2, decoded.numberOfChannels) || 1;
    const buffer = LAME_RATES.includes(decoded.sampleRate)
      ? decoded
      : await resample(decoded, channels);

    const sampleRate = buffer.sampleRate;
    const kbps = channels > 1 ? TARGET_KBPS_STEREO : TARGET_KBPS_MONO;

    const left = toInt16(buffer.getChannelData(0));
    const right = channels > 1 ? toInt16(buffer.getChannelData(1)) : null;

    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const encoder = new Mp3Encoder(channels, sampleRate, kbps);

    const parts: Uint8Array[] = [];
    let outputBytes = 0;
    const deadline = Date.now() + TIME_BUDGET_MS;

    for (let offset = 0; offset < left.length; ) {
      // Encode a slice, then hand the main thread back so the editor stays
      // responsive while a long track is processed.
      const sliceEnd = Math.min(
        left.length,
        offset + SAMPLES_PER_BLOCK * BLOCKS_PER_SLICE,
      );
      for (; offset < sliceEnd; offset += SAMPLES_PER_BLOCK) {
        const end = Math.min(offset + SAMPLES_PER_BLOCK, left.length);
        const chunk = right
          ? encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end))
          : encoder.encodeBuffer(left.subarray(offset, end));
        if (chunk.length) {
          parts.push(chunk);
          outputBytes += chunk.length;
        }
      }
      if (Date.now() > deadline) return pass("encode budget exceeded");
      await yieldToUi();
    }

    const tail = encoder.flush();
    if (tail.length) {
      parts.push(tail);
      outputBytes += tail.length;
    }

    // Nothing gained (unusual, but e.g. a source that was already lean).
    if (!outputBytes || outputBytes >= originalBytes) return pass("no size win");

    const baseName = (file.name || "music").replace(/\.[^./\\]+$/, "") || "music";
    const optimizedFile = new File(parts as BlobPart[], `${baseName}.mp3`, {
      type: "audio/mpeg",
      lastModified: Date.now(),
    });

    return { file: optimizedFile, optimized: true, originalBytes, outputBytes };
  } catch (err) {
    console.warn("[audioOptimize] falling back to the original file", err);
    return pass("optimization failed");
  } finally {
    // Free the hardware context either way; decoding doesn't need it any more.
    try {
      await ctx.close();
    } catch {}
  }
}
