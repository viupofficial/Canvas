// updated
import React, { useEffect, useState } from 'react';
import type { EditorHandle } from '@/src/components/CanvasEditor';
import {
  useEventData,
  giftAccounts,
  legacyGiftFields,
  QR_DEFAULT_SIZE,
  QR_MIN_SIZE,
  QR_MAX_SIZE,
  GIFT_MAX_ACCOUNTS,
  PACK_TYPE_MAX_LENGTH,
  PACK_TYPE_DEFAULT_OPTION_1,
  PACK_TYPE_DEFAULT_OPTION_2,
  type GiftAccount,
} from '@/src/store/EventDataContext';
import LivePreviewPanel from '@/src/components/canvas-editor/LivePreviewPanel';
import MobileToolbar from '@/src/components/canvas-editor/mobile-toolbar';
import { prayerPage } from "@/src/components/template-list/prayerTemplate";
import { countdownPage } from "@/src/components/template-list/timeBoxTemplate";
import { itineraryPage } from "@/src/components/template-list/itineraryTemplate";
import { eventDetailsPage } from "@/src/components/template-list/eventTemplate";
import { parentsPage } from "@/src/components/template-list/parentsTemplate";
import { invitationPage } from "@/src/components/template-list/invitationTemplate";
import { guestbookPage } from "@/src/components/template-list/guestbookTemplate";
import { galleryPage } from "@/src/components/template-list/galleryTemplate";
import { envelopePage } from "@/src/components/template-list/EnvelopeTemplate";
import { downscaleImageFile } from "@/src/lib/imageDownscale";
import Scrubbable from "@/src/components/canvas-editor/scrubbable";
import GradientEditor, { FillTypeSelect } from "@/src/components/canvas-editor/GradientEditor";
import {
  type GradientDescriptor,
  isGradientValue,
  solidToGradient,
  firstColorHex,
  invertColorValue,
} from "@/src/lib/gradient";
import { Play, Pause } from "lucide-react";
import {
  getPackageRules,
  normalizeUsageCounter,
  EMPTY_FEATURE_USAGE,
  UPGRADE_MESSAGES,
  type PackageRules,
  type FeatureUsage,
} from "@/src/lib/packageRules";
import { showPackageToast } from "@/src/components/PackageLimitToast";

// Invert a 6-digit hex color (Adobe-style negative). Falls back gracefully for non-hex input.
function invertHex(color: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((color ?? '').trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const inv = 0xffffff - n;
  return '#' + inv.toString(16).padStart(6, '0');
}

const colorIconBtnCls =
  "h-[34px] w-[34px] shrink-0 rounded-[10px] flex items-center justify-center bg-[#F2E8E6B2] text-[#7D5B59] border border-[#EDE2DE] hover:bg-[#EDE2DE] transition-colors";

function RevertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function InvertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
    </svg>
  );
}

type Tab =
  | 'templates'
  | 'elements'
  | 'background'
  | 'text'
  | 'photo'
  | 'music'
  | 'contact'
  | 'location'
  | 'calendar'
  | 'rsvp'
  | 'money'
  | 'wishlist';

const PREVIEW_TABS = ['contact', 'location', 'calendar', 'rsvp', 'money'] as const;
type PreviewTabName = typeof PREVIEW_TABS[number];

const SIDEBAR_ITEMS: { id: Tab; label: string; icon: string; disabled?: boolean }[] = [
  { id: 'templates', label: 'Templates', icon: '/template.svg' },
  { id: 'elements', label: 'Elements', icon: '/elements.svg' },
  { id: 'background', label: 'Background', icon: '/background.svg' },
  { id: 'text', label: 'Text', icon: '/text.svg' },
  { id: 'photo', label: 'Photo Gallery', icon: '/photo-gallery.svg' },
  { id: 'music', label: 'Music', icon: '/music.svg' },
  { id: 'contact', label: 'Contact', icon: '/contact.svg' },
  { id: 'location', label: 'Location', icon: '/location.svg' },
  { id: 'calendar', label: 'Calendar', icon: '/calendar.svg' },
  { id: 'rsvp', label: 'RSVP', icon: '/rsvp.svg' },
  { id: 'money', label: 'Money Gift', icon: '/money-gift.svg' },
  // { id: 'wishlist', label: 'Wishlist', icon: '/wishlist.svg' },
];

// Interactive elements that can be dropped onto any page. Both are functional:
// "Counting Days" ticks towards the saved Calendar date; "Guestbook" cycles
// through wishes in the published invitation.
const INTERACTIVE_ELEMENTS: { id: 'countdown' | 'guestbook'; label: string; icon: React.ReactNode }[] = [
  {
    id: 'countdown',
    label: 'Counting Days',
    icon: <img src="/Stopwatch.svg" width={28} height={28} aria-hidden alt="" />,
  },
  {
    id: 'guestbook',
    label: 'Guestbook',
    icon: <img src="/Guestbook.svg" width={28} height={28} aria-hidden alt="" />,
  },
];

// const PREMIUM_TABS: Tab[] = ['rsvp', 'money', 'wishlist']; // disabled — all tabs unlocked

const TEMPLATE_LIST = [
  {
    id: "full-template",
    name: "Full Invitation",
    pages: [
      envelopePage,
      invitationPage,
      parentsPage,
      eventDetailsPage,
       itineraryPage,
       galleryPage,
       guestbookPage,
      countdownPage,
      prayerPage,
     
      
      
      
      
    ],
  },
];

// ─── Tab components defined OUTSIDE Sidebar so they are stable across renders ───

// Default photos shown in the gallery on first open. These point to files in
// /public — drop new files there and add the path here to expand the seed set.
const DEFAULT_PHOTOS: string[] = [
  '/aiCouple-1.png',
  '/aiCouple-2.png',
 
];

function PhotoTab({
  editorRef,
  onEditImage,
  rules,
}: {
  editorRef?: React.RefObject<EditorHandle | null>;
  onEditImage?: (src: string, onReplace: (dataUrl: string) => void) => void;
  rules: PackageRules;
}) {
  // Single source of truth for the gallery — seeded with the default photos so
  // edit / duplicate / delete can all operate in place by index.
  const [photos, setPhotos] = useState<string[]>([...DEFAULT_PHOTOS]);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [slideIntervalSec, setSlideIntervalSec] = useState(5);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Gallery toggle — ON ⇒ a gallery page exists in the canvas, OFF ⇒ none.
  // Seed from the editor so the switch reflects the actual canvas state.
  const [galleryOn, setGalleryOn] = useState(
    () => editorRef?.current?.hasGalleryPage?.() ?? false,
  );

  // Reactive mirror of the gallery photo count so the "limit reached" note can
  // render (getGalleryCount is imperative). Refreshed on toggle + each add.
  const [galleryCount, setGalleryCount] = useState(0);
  const refreshGalleryCount = () =>
    setGalleryCount(editorRef?.current?.getGalleryCount?.() ?? 0);

  useEffect(() => {
    refreshGalleryCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryOn]);

  const galleryLimit = rules.galleryLimit;
  const galleryLimited = Number.isFinite(galleryLimit);
  const galleryAtLimit = galleryOn && galleryLimited && galleryCount >= galleryLimit;
  const galleryLimitMessage = rules.isBasicPackage
    ? UPGRADE_MESSAGES.galleryBasicSidebar
    : rules.isStandardPackage
    ? UPGRADE_MESSAGES.galleryStandardSidebar
    : "";

  const toggleGallery = () => {
    const next = !galleryOn;
    setGalleryOn(next);
    if (next) editorRef?.current?.addGalleryPage?.();
    else editorRef?.current?.removeGalleryPage?.();
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    // Chain sequentially so multi-file uploads keep their FIFO order even
    // though downscaling finishes at different speeds per file.
    let chain: Promise<unknown> = Promise.resolve();
    // Package gallery cap only applies once a gallery page exists (that's what
    // the limit counts). `projected` tracks the running total so a multi-file
    // drop stops exactly at the limit instead of overshooting.
    let projected = editorRef?.current?.getGalleryCount?.() ?? 0;
    let blocked = false;
    // Tallies drive the summary toast so the user always knows whether each
    // photo actually made it into the gallery (added) or fell over (failed).
    let added = 0;
    let failed = 0;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (galleryOn && galleryLimited && projected >= galleryLimit) {
        blocked = true;
        return;
      }
      if (galleryOn) projected += 1;
      chain = chain
        .then(() => downscaleImageFile(file))
        .then((dataUrl) => {
          setPhotos((prev) => [...prev, dataUrl]);
          // Grow the gallery page with each newly uploaded photo (FIFO order).
          // No-op if no gallery page exists.
          editorRef?.current?.addPhotoToGallery?.(dataUrl);
          refreshGalleryCount();
          added += 1;
        })
        .catch((err) => {
          console.error('[PhotoTab] failed to add image', file?.name, err);
          failed += 1;
        });
    });
    // Summarise once the whole batch settles (the toast host shows one message
    // at a time, so we fold the outcome into a single, prioritised toast:
    // failures first — they're the actionable half — then the package-limit
    // nudge, then a plain success). Deferring to the chain keeps a late success
    // from overwriting the limit warning.
    chain.then(() => {
      if (failed > 0 && added > 0) {
        showPackageToast(`${added} photo${added === 1 ? '' : 's'} added, ${failed} failed — please retry the failed one${failed === 1 ? '' : 's'}.`, 'error');
      } else if (failed > 0) {
        showPackageToast(failed === 1 ? "That photo couldn't be added — please try again." : `${failed} photos couldn't be added — please try again.`, 'error');
      } else if (blocked) {
        showPackageToast(UPGRADE_MESSAGES.gallery(galleryLimit));
      } else if (added > 0) {
        showPackageToast(added === 1 ? 'Photo added to your gallery.' : `${added} photos added to your gallery.`, 'success');
      }
    });
  };

  const addToCanvas = (src: string) => {
    editorRef?.current?.addImageFromUrl?.(src);
  };

  const replaceAt = (index: number, dataUrl: string) => {
    setPhotos((prev) => prev.map((s, i) => (i === index ? dataUrl : s)));
  };

  const duplicateAt = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, prev[index]);
      return next;
    });
  };

  const deleteAt = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[#191212] text-[17px] font-bold">Photos</div>
        <button
          type="button"
          role="switch"
          aria-checked={galleryOn}
          aria-label="Toggle gallery page"
          title={galleryOn ? 'Remove gallery page' : 'Add gallery page'}
          onClick={toggleGallery}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            galleryOn ? 'bg-[#8C6B6B]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              galleryOn ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>

      {galleryOn && (
        <div className="flex items-center justify-between mb-3 px-1">
          <label className="text-[12px] text-gray-500 font-medium">Slide every</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={60}
              value={slideIntervalSec}
              onChange={(e) => {
                const sec = Math.max(1, Math.min(60, Number(e.target.value)));
                setSlideIntervalSec(sec);
                editorRef?.current?.setGallerySlideInterval?.(sec * 1000);
              }}
              className="w-14 px-2 py-1 border border-gray-200 rounded text-[12px] text-center font-semibold text-[#7D5B59] bg-[#F2E8E6B2] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[12px] text-gray-500">sec</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => {
          if (galleryAtLimit) {
            showPackageToast(UPGRADE_MESSAGES.gallery(galleryLimit));
            return;
          }
          fileInputRef.current?.click();
        }}
        disabled={galleryAtLimit}
        className={`w-full px-3 py-2 rounded text-sm font-medium transition mb-3 ${
          galleryAtLimit
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gray-100 hover:bg-gray-200'
        }`}
      >
        + Upload Images
      </button>
      {galleryAtLimit && galleryLimitMessage && (
        <div className="mb-3 rounded-md bg-[#FBF1EC] border border-[#E7C9BC] px-3 py-2 text-[11px] font-semibold text-[#8C5B3F]">
          {galleryLimitMessage}
        </div>
      )}
      <div className="text-[11px] text-gray-400 text-center mb-2">
        Double-click to add to canvas. Right-click for more options.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((src, i) => (
          <img
            key={`${src.slice(0, 32)}-${i}`}
            src={src}
            alt={`photo-${i}`}
            draggable
            onDoubleClick={() => addToCanvas(src)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, index: i });
            }}
            onDragStart={(e) => {
              const payload = JSON.stringify({ type: 'image-url', url: src });
              try { e.dataTransfer.setData('application/json', payload); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { }
            }}
            className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition bg-gray-50"
            title="Double-click to add to canvas · Right-click for options"
          />
        ))}
      </div>

      {menu && (
        <div
          className="fixed z-[60] min-w-[170px] bg-white border border-neutral-200 rounded-lg shadow-xl py-1.5 text-sm text-neutral-800 select-none"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => { addToCanvas(photos[menu.index]); setMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
          >
            Add to canvas
          </button>
          <button
            onClick={() => {
              const idx = menu.index;
              setMenu(null);
              onEditImage?.(photos[idx], (dataUrl) => replaceAt(idx, dataUrl));
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
          >
            Edit image
          </button>
          <button
            onClick={() => { duplicateAt(menu.index); setMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 cursor-pointer"
          >
            Duplicate
          </button>
          <button
            onClick={() => { deleteAt(menu.index); setMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function MusicTab({
  editorRef,
  rules,
  musicChanges,
}: {
  editorRef?: React.RefObject<EditorHandle | null>;
  rules: PackageRules;
  musicChanges: number;
}) {
  const [url, setUrl] = useState("");
  // Mirrors the editor preview player. New music auto-plays, so default to true.
  const [playing, setPlaying] = useState(true);

  const musicLimit = rules.musicChangeLimit;
  const musicLimited = Number.isFinite(musicLimit);
  const musicAtLimit = musicLimited && musicChanges >= musicLimit;
  const musicRemaining = musicLimited ? Math.max(0, musicLimit - musicChanges) : Infinity;

  const togglePlay = () => {
    const ed = editorRef?.current;
    if (!ed) return;
    // Nothing to control until a track has been added/uploaded.
    if (!ed.getMusicUrl?.()) return;
    if (playing) {
      ed.pauseMusic?.();
      setPlaying(false);
    } else {
      ed.playMusic?.();
      setPlaying(true);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[#191212] text-[17px] font-bold">Add Music</div>
        <button
          onClick={togglePlay}
          title={playing ? "Pause music" : "Play music"}
          aria-label={playing ? "Pause music" : "Play music"}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#7D5B59] text-white hover:bg-[#684b49] transition-colors"
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
      </div>
      {rules.isBasicPackage && (
        musicAtLimit ? (
          <div className="mb-3 rounded-md bg-[#FBF1EC] border border-[#E7C9BC] px-3 py-2 text-[11px] font-semibold text-[#8C5B3F]">
            {UPGRADE_MESSAGES.music}
          </div>
        ) : (
          <div className="mb-3 rounded-md bg-[#F2E8E6] border border-[#E4D3CE] px-3 py-2 text-[11px] font-semibold text-[#7D5B59]">
            {UPGRADE_MESSAGES.musicRemaining(musicRemaining)}
          </div>
        )
      )}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => {
            // Block + nudge once the Basic music-change limit is reached.
            if (musicAtLimit) {
              showPackageToast(UPGRADE_MESSAGES.music);
              return;
            }
            if (editorRef?.current?.uploadMusic) {
              editorRef.current.uploadMusic();
              setPlaying(true);
            }
          }}
          disabled={musicAtLimit}
          className={`px-3 py-2 rounded text-left ${
            musicAtLimit ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100'
          }`}
        >
          Upload Music
        </button>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Audio URL or YouTube link"
            className="flex-1 px-2 py-1 border rounded"
          />
          <button
            onClick={() => {
              if (!url) return;
              if (musicAtLimit) {
                showPackageToast(UPGRADE_MESSAGES.music);
                return;
              }
              if (editorRef?.current?.addMusicFromUrl) {
                editorRef.current.addMusicFromUrl(url.trim());
                setPlaying(true);
              }
              setUrl("");
            }}
            disabled={musicAtLimit}
            className={`px-3 py-1 rounded text-[#5a2d2d] ${
              musicAtLimit ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-brand-accent'
            }`}
          >
            Add
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Paste a direct audio link or a YouTube URL (youtube.com or youtu.be).
          Use the play/pause button above to preview it. YouTube plays as
          background audio only — the video stays hidden.
        </p>
      </div>
    </div>
  );
}

function ContactTab() {
  const { eventData, setSection } = useEventData();
  const [contacts, setLocalContacts] = useState(
    eventData.contacts.length ? eventData.contacts : [{ name: '', phone: '' }]
  );

  const pushLive = (next: { name: string; phone: string }[]) => {
    setLocalContacts(next);
    setSection('contacts', next);
  };

  const handleAdd = () => {
    pushLive([...contacts, { name: '', phone: '' }]);
  };

  const handleChange = (index: number, field: 'name' | 'phone', value: string) => {
    const updated = contacts.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    pushLive(updated);
  };

  const handleDelete = (index: number) => {
    const updated = contacts.filter((_, i) => i !== index);
    pushLive(updated.length ? updated : [{ name: '', phone: '' }]);
  };

  const handleSave = () => {
    const valid = contacts.every(c => c.name && c.phone);
    if (!valid) {
      alert("Please fill all fields");
      return;
    }
    setSection('contacts', contacts);
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-1">Contact</div>
      <p className="text-[11px] text-[#7D5B5980] mb-4">Please do not use dashes (-) in the phone number.</p>
      <div className="flex flex-col gap-3">
        {contacts.map((c, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 ${i > 0 ? 'mt-4 pt-4 border-t border-gray-200' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#7D5B5980]">Contact {i + 1}</span>
              {contacts.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  title="Remove contact"
                  className="h-6 w-6 flex items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              )}
            </div>
            <input
              value={c.name}
              onChange={(e) => handleChange(i, 'name', e.target.value)}
              placeholder="Name"
              className="px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="number"
              value={c.phone}
              onChange={(e) => handleChange(i, 'phone', e.target.value)}
              placeholder="Phone Number"
              className="px-3 py-2 border rounded-md text-sm"
            />
          </div>
        ))}
        <div className="flex justify-center">
          <button
            onClick={handleAdd}
            className="w-10 h-10 rounded-full bg-[#8C6B6B] text-white text-xl flex items-center justify-center"
          >
            +
          </button>
        </div>
        <button
          onClick={handleSave}
          className="mt-2 py-2 rounded-md bg-[#8C6B6B] text-white font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function LocationTab({
  rules,
  locationChanges,
  onLocationChanged,
}: {
  rules: PackageRules;
  locationChanges: number;
  onLocationChanged?: () => void;
}) {
  const { eventData, setSection, updateEventData } = useEventData();
  const [address, setAddress] = useState(eventData.location?.address ?? '');
  // "Show Location" — ON ⇒ Location is reachable from the invitation footer.
  // Defaults to ON unless explicitly turned off, so existing designs are
  // unaffected. Mirrors the RSVP toggle pattern.
  const [locationOn, setLocationOn] = useState(eventData.location?.enabled !== false);

  const limit = rules.locationChangeLimit;
  const limited = Number.isFinite(limit);
  const atLimit = limited && locationChanges >= limit;
  const remaining = limited ? Math.max(0, limit - locationChanges) : Infinity;

  const toggleLocation = () => {
    const next = !locationOn;
    setLocationOn(next);
    // Merge-patch so this works before an address exists (the section becomes
    // `{ enabled: false }`) and never counts against the change limit — this is
    // a visibility switch, not a location change.
    updateEventData('location', { enabled: next });
  };

  // setSection replaces the section wholesale, so `enabled` has to be re-stated
  // on every commit; an empty address keeps a bare `{ enabled: false }` because
  // undefined would read back as ON.
  const commitAddress = (value: string) => {
    setSection(
      'location',
      value ? { address: value, enabled: locationOn } : locationOn ? null : { enabled: false },
    );
  };

  const handleChange = (value: string) => {
    setAddress(value);
    // For limited (Basic) packages the change must go through the gated Save so
    // it can be counted/blocked — no live commit. Other tiers keep live preview.
    if (!rules.isBasicPackage) {
      commitAddress(value);
    }
  };

  const handleSave = () => {
    const trimmed = address.trim();
    if (!trimmed) {
      alert("Please enter a location");
      return;
    }
    const committed = (eventData.location?.address ?? '').trim();
    // Re-saving the same address isn't a change — commit it but don't count it.
    if (trimmed === committed) {
      commitAddress(trimmed);
      return;
    }
    if (atLimit) {
      showPackageToast(UPGRADE_MESSAGES.location);
      return;
    }
    commitAddress(trimmed);
    onLocationChanged?.();
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-4">Location</div>

      <div className="flex items-center justify-between mb-3">
        <label className="text-xs text-gray-600">Show Location</label>
        <button
          type="button"
          role="switch"
          aria-checked={locationOn}
          aria-label="Show Location"
          title={locationOn ? 'Hide Location' : 'Show Location'}
          onClick={toggleLocation}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            locationOn ? 'bg-[#8C6B6B]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              locationOn ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>

      {/* The address field stays editable when the toggle is off: it also fills
          the LOCATION line of the calendar export (ICS / Google link). */}
      {!locationOn && (
        <div className="mb-3 rounded-md bg-[#F2E8E6] border border-[#E4D3CE] px-3 py-2 text-[11px] font-semibold text-[#7D5B59]">
          Location is hidden from the invitation footer. The address below is still used for calendar exports.
        </div>
      )}

      {rules.isBasicPackage && (
        atLimit ? (
          <div className="mb-3 rounded-md bg-[#FBF1EC] border border-[#E7C9BC] px-3 py-2 text-[11px] font-semibold text-[#8C5B3F]">
            {UPGRADE_MESSAGES.location}
          </div>
        ) : (
          <div className="mb-3 rounded-md bg-[#F2E8E6] border border-[#E4D3CE] px-3 py-2 text-[11px] font-semibold text-[#7D5B59]">
            {UPGRADE_MESSAGES.locationRemaining(remaining)}
          </div>
        )
      )}
      <div className="flex flex-col gap-3">
        <input
          value={address}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Location Address"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#BBA8A7]"
        />
        <button
          onClick={handleSave}
          disabled={atLimit}
          className={`mt-2 py-2 rounded-md text-white font-semibold transition ${
            atLimit ? 'bg-[#C9B7B6] cursor-not-allowed' : 'bg-[#8C6B6B] hover:opacity-90'
          }`}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function CalendarTab() {
  const { eventData, setSection, updateEventData } = useEventData();
  // "Show Calendar" — ON ⇒ Calendar is reachable from the invitation footer.
  // Defaults to ON unless explicitly turned off, so existing designs are
  // unaffected. Mirrors the RSVP toggle pattern.
  const [calendarOn, setCalendarOn] = useState(eventData.calendar?.enabled !== false);
  const [date, setDate] = useState(eventData.calendar?.date ?? '');
  const [title, setTitle] = useState(eventData.calendar?.title ?? '');
  const [startTime, setStartTime] = useState(eventData.calendar?.startTime ?? '');
  const [endTime, setEndTime] = useState(eventData.calendar?.endTime ?? '');
  const [reminder, setReminder] = useState<number | ''>(
    typeof eventData.calendar?.reminderMinutes === 'number'
      ? eventData.calendar.reminderMinutes
      : '',
  );

  const toggleCalendar = () => {
    const next = !calendarOn;
    setCalendarOn(next);
    // Merge-patch, so this also works before a date has been picked (the section
    // becomes `{ enabled: false }`) and never disturbs the saved date/title.
    updateEventData('calendar', { enabled: next });
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    if (value) {
      updateEventData('calendar', { date: value });
    } else {
      // Clearing the date drops the section — unless the toggle is off, which
      // has to survive on its own (undefined would read back as ON).
      setSection('calendar', calendarOn ? null : { enabled: false });
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (date) updateEventData('calendar', { title: value });
  };

  const handleStartTimeChange = (value: string) => {
    setStartTime(value);
    if (date) updateEventData('calendar', { startTime: value || undefined });
  };

  const handleEndTimeChange = (value: string) => {
    setEndTime(value);
    if (date) updateEventData('calendar', { endTime: value || undefined });
  };

  const handleReminderChange = (raw: string) => {
    if (raw === '') {
      setReminder('');
      if (date) updateEventData('calendar', { reminderMinutes: undefined });
      return;
    }
    const n = Number(raw);
    setReminder(Number.isFinite(n) ? n : '');
    if (date && Number.isFinite(n)) {
      updateEventData('calendar', { reminderMinutes: n > 0 ? n : undefined });
    }
  };

  const handleSave = () => {
    if (!date) {
      alert("Please select a date");
      return;
    }
    setSection('calendar', {
      date,
      enabled: calendarOn,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(typeof reminder === 'number' && reminder > 0
        ? { reminderMinutes: reminder }
        : {}),
    });
  };

  // Common Google-Calendar-style reminder presets (minutes).
  const REMINDER_PRESETS: Array<{ label: string; value: number | '' }> = [
    { label: 'No reminder', value: '' },
    { label: '10 minutes before', value: 10 },
    { label: '30 minutes before', value: 30 },
    { label: '1 hour before', value: 60 },
    { label: '1 day before', value: 24 * 60 },
    { label: '1 week before', value: 7 * 24 * 60 },
  ];

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-4">Calendar</div>

      <div className="flex items-center justify-between mb-3">
        <label className="text-xs text-gray-600">Show Calendar</label>
        <button
          type="button"
          role="switch"
          aria-checked={calendarOn}
          aria-label="Show Calendar"
          title={calendarOn ? 'Hide Calendar' : 'Show Calendar'}
          onClick={toggleCalendar}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            calendarOn ? 'bg-[#8C6B6B]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              calendarOn ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>

      {/* Unlike RSVP, the fields stay editable when the toggle is off: the date
          also feeds the canvas countdown element, which is independent of the
          footer entry this toggle controls. */}
      {!calendarOn && (
        <div className="mb-3 rounded-md bg-[#F2E8E6] border border-[#E4D3CE] px-3 py-2 text-[11px] font-semibold text-[#7D5B59]">
          Calendar is hidden from the invitation footer. The date below still drives the countdown.
        </div>
      )}

      <div className="flex flex-col gap-3">
        <label className="text-xs text-gray-600">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Event title"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />

        <label className="text-xs text-gray-600">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />

        <label className="text-xs text-gray-600">Time</label>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-400">From</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-400">To</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => handleEndTimeChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>

        <label className="text-xs text-gray-600">Notification</label>
        <select
          value={reminder === '' ? '' : String(reminder)}
          onChange={(e) => handleReminderChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          {REMINDER_PRESETS.map((p) => (
            <option key={String(p.value)} value={p.value === '' ? '' : String(p.value)}>
              {p.label}
            </option>
          ))}
        </select>

        <button
          onClick={handleSave}
          className="mt-2 py-2 rounded-md bg-[#8C6B6B] text-white font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function RSVPTab() {
  const { eventData, updateEventData, setSection } = useEventData();
  const current = eventData.rsvpConfig;

  // RSVP toggle — ON ⇒ RSVP is available on the invitation, OFF ⇒ hidden.
  // Defaults to ON unless explicitly turned off, so existing designs are
  // unaffected. Mirrors the Photo Gallery toggle pattern.
  const [rsvpOn, setRsvpOn] = useState(current?.enabled !== false);

  const toggleRsvp = () => {
    const next = !rsvpOn;
    setRsvpOn(next);
    updateEventData('rsvpConfig', { enabled: next } as any);
  };

  const [maxGuest, setMaxGuest] = useState<number | ''>(current?.maxGuest ?? '');
  // Guest Category ("Are you coming as? Family / Friends"). Opt-in, so it starts
  // OFF unless explicitly saved as ON — designs made before this existed keep the
  // form they were published with. See RSVPConfig.packTypeEnabled.
  const [packTypeOn, setPackTypeOn] = useState(current?.packTypeEnabled === true);
  // The two category names. Blank means "use the default wording" — the stored
  // value is what guests see AND what is submitted as pack_type, so the
  // placeholders show the fallback the invitation will actually use.
  const [packTypeOption1, setPackTypeOption1] = useState(current?.packTypeOption1 ?? '');
  const [packTypeOption2, setPackTypeOption2] = useState(current?.packTypeOption2 ?? '');
  // navColor / circleColor accept a solid hex string OR a gradient descriptor
  // (rendered via cssBackground in the footer). textColor stays solid-only —
  // it feeds CSS `color` and currentColor icon masks, which can't take a gradient.
  const [navColor, setNavColor] = useState<string | GradientDescriptor>(current?.navColor ?? '#000000');
  const [navOpacity, setNavOpacity] = useState(current?.navOpacity ?? 100);
  const [textColor, setTextColor] = useState(current?.textColor ?? '#000000');
  const [textOpacity, setTextOpacity] = useState(current?.textOpacity ?? 100);
  // The small half-circle "notch" behind the RSVP circle (defaults to white).
  const [circleColor, setCircleColor] = useState<string | GradientDescriptor>(current?.circleColor ?? '#ffffff');
  const [circleOpacity, setCircleOpacity] = useState(current?.circleOpacity ?? 100);

  const pushField = <K extends keyof NonNullable<typeof current>>(
    field: K,
    value: NonNullable<typeof current>[K],
  ) => {
    updateEventData('rsvpConfig', { [field]: value } as any);
  };

  const togglePackType = () => {
    const next = !packTypeOn;
    setPackTypeOn(next);
    pushField('packTypeEnabled', next);
  };

  // Keep the raw text locally (so a trailing space can be typed mid-word) but
  // store it trimmed and capped — the stored value IS the submitted pack_type.
  const changePackTypeOption = (
    field: 'packTypeOption1' | 'packTypeOption2',
    value: string,
    set: (v: string) => void,
  ) => {
    const next = value.slice(0, PACK_TYPE_MAX_LENGTH);
    set(next);
    pushField(field, next.trim());
  };

  // Original colors captured once, so each Revert restores the starting value.
  const origNavColor = React.useRef(current?.navColor ?? '#000000');
  const origNavOpacity = React.useRef(current?.navOpacity ?? 100);
  const origTextColor = React.useRef(current?.textColor ?? '#000000');
  const origTextOpacity = React.useRef(current?.textOpacity ?? 100);
  const origCircleColor = React.useRef(current?.circleColor ?? '#ffffff');
  const origCircleOpacity = React.useRef(current?.circleOpacity ?? 100);

  const revertNav = () => {
    setNavColor(origNavColor.current);
    pushField('navColor', origNavColor.current);
    setNavOpacity(origNavOpacity.current);
    pushField('navOpacity', origNavOpacity.current);
  };
  const invertNav = () => {
    const inv = invertColorValue(navColor);
    setNavColor(inv);
    pushField('navColor', inv);
  };
  // Switch a color field between solid and gradient modes (Figma-style picker).
  const changeColorMode = (
    field: 'navColor' | 'circleColor',
    value: string | GradientDescriptor,
    set: (v: string | GradientDescriptor) => void,
    mode: 'solid' | 'linear' | 'radial',
  ) => {
    let next: string | GradientDescriptor;
    if (mode === 'solid') {
      if (!isGradientValue(value)) return;
      next = firstColorHex(value, '#000000');
    } else if (isGradientValue(value)) {
      if (value.type === mode) return;
      next = { ...value, type: mode };
    } else {
      next = solidToGradient(value, mode);
    }
    set(next);
    pushField(field, next);
  };
  const revertText = () => {
    setTextColor(origTextColor.current);
    pushField('textColor', origTextColor.current);
    setTextOpacity(origTextOpacity.current);
    pushField('textOpacity', origTextOpacity.current);
  };
  const invertText = () => {
    const inv = invertHex(textColor);
    setTextColor(inv);
    pushField('textColor', inv);
  };
  const revertCircle = () => {
    setCircleColor(origCircleColor.current);
    pushField('circleColor', origCircleColor.current);
    setCircleOpacity(origCircleOpacity.current);
    pushField('circleOpacity', origCircleOpacity.current);
  };
  const invertCircle = () => {
    const inv = invertColorValue(circleColor);
    setCircleColor(inv);
    pushField('circleColor', inv);
  };

  const handleSave = () => {
    if (!maxGuest) {
      alert("Please enter max guest");
      return;
    }
    // setSection REPLACES the whole config, so every field the tab owns has to be
    // listed here — omitting any of the Guest Category fields would silently
    // reset them on Save. Labels are stored trimmed; blank is allowed and means
    // "use the default wording" (packTypeOptions() applies the fallback).
    setSection('rsvpConfig', {
      enabled: rsvpOn,
      maxGuest,
      packTypeEnabled: packTypeOn,
      packTypeOption1: packTypeOption1.trim(),
      packTypeOption2: packTypeOption2.trim(),
      navColor, navOpacity, textColor, textOpacity, circleColor, circleOpacity,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[#191212] text-[17px] font-bold">RSVP</div>
        <button
          type="button"
          role="switch"
          aria-checked={rsvpOn}
          aria-label="Toggle RSVP"
          title={rsvpOn ? 'Disable RSVP' : 'Enable RSVP'}
          onClick={toggleRsvp}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            rsvpOn ? 'bg-[#8C6B6B]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              rsvpOn ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>
      {!rsvpOn ? (
        <p className="text-[12px] text-gray-400 text-center py-6">
          RSVP is turned off. Guests won&apos;t see it on the invitation.
        </p>
      ) : (
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-gray-500">Max Guest Capacity</label>
          <input
            type="number"
            value={maxGuest}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxGuest(v);
              pushField('maxGuest', v);
            }}
            placeholder="Enter number"
            className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>

        {/* Guest Category — asks accepting guests whether they are Family or
            Friends. Stored on the RSVP record's pack_type, separately from pax. */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-500">Guest Category</label>
          <button
            type="button"
            role="switch"
            aria-checked={packTypeOn}
            aria-label="Toggle Guest Category"
            title={packTypeOn ? 'Disable Guest Category' : 'Enable Guest Category'}
            onClick={togglePackType}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              packTypeOn ? 'bg-[#8C6B6B]' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                packTypeOn ? 'translate-x-[18px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>

        {/* The two category names guests choose between. Whatever is typed here
            is what the guest sees AND what is stored as the RSVP's pack_type. */}
        {packTypeOn && (
          <div className="flex flex-col gap-3 -mt-1">
            <div>
              <label className="text-xs text-gray-500">Category 1</label>
              <input
                type="text"
                value={packTypeOption1}
                maxLength={PACK_TYPE_MAX_LENGTH}
                onChange={(e) => changePackTypeOption('packTypeOption1', e.target.value, setPackTypeOption1)}
                placeholder={PACK_TYPE_DEFAULT_OPTION_1}
                className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Category 2</label>
              <input
                type="text"
                value={packTypeOption2}
                maxLength={PACK_TYPE_MAX_LENGTH}
                onChange={(e) => changePackTypeOption('packTypeOption2', e.target.value, setPackTypeOption2)}
                placeholder={PACK_TYPE_DEFAULT_OPTION_2}
                className="mt-1 w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-400 leading-snug">
              Leave blank to use {PACK_TYPE_DEFAULT_OPTION_1} and {PACK_TYPE_DEFAULT_OPTION_2}. Max{' '}
              {PACK_TYPE_MAX_LENGTH} characters each.
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] text-[#7D5B5980] font-[600]">Navigation Bar</label>
            <FillTypeSelect
              label="Navigation Bar"
              value={isGradientValue(navColor) ? navColor.type : 'solid'}
              onChange={(mode) => changeColorMode('navColor', navColor, setNavColor, mode)}
            />
          </div>
          {isGradientValue(navColor) ? (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <GradientEditor
                  value={navColor}
                  onChange={(g) => {
                    setNavColor(g);
                    pushField('navColor', g);
                  }}
                />
              </div>
              <button type="button" title="Revert Navigation Bar" aria-label="Revert Navigation Bar" onClick={revertNav} className={colorIconBtnCls}>
                <RevertIcon />
              </button>
              <button type="button" title="Invert Navigation Bar" aria-label="Invert Navigation Bar" onClick={invertNav} className={colorIconBtnCls}>
                <InvertIcon />
              </button>
            </div>
          ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2 flex-1 min-w-0">
              <label
                className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
                style={{ backgroundColor: navColor }}
              >
                <input
                  type="color"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  value={navColor}
                  onChange={(e) => {
                    setNavColor(e.target.value);
                    pushField('navColor', e.target.value);
                  }}
                />
              </label>
              <input
                className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] leading-none text-[#7D5B59]"
                value={navColor.replace('#', '').toUpperCase()}
                onChange={(e) => {
                  const hex = e.target.value.replace('#', '');
                  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
                    const next = '#' + hex;
                    setNavColor(next);
                    pushField('navColor', next);
                  }
                }}
                maxLength={6}
              />
              <div className="w-[2px] self-stretch -my-2 bg-white shrink-0 ml-auto" />
              <Scrubbable
                className="flex items-baseline gap-0.5 shrink-0 pl-1"
                min={0}
                max={100}
                value={navOpacity}
                onScrub={(v) => {
                  setNavOpacity(v);
                  pushField('navOpacity', v);
                }}
              >
                <input
                  className="w-[32px] bg-transparent outline-none text-right font-[600] text-[16px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  type="number"
                  min={0}
                  max={100}
                  value={navOpacity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setNavOpacity(v);
                    pushField('navOpacity', v);
                  }}
                />
                <span className="font-[600] text-[16px] leading-none text-[#B98587]">%</span>
              </Scrubbable>
            </div>
            <button type="button" title="Revert Navigation Bar" aria-label="Revert Navigation Bar" onClick={revertNav} className={colorIconBtnCls}>
              <RevertIcon />
            </button>
            <button type="button" title="Invert Navigation Bar" aria-label="Invert Navigation Bar" onClick={invertNav} className={colorIconBtnCls}>
              <InvertIcon />
            </button>
          </div>
          )}
        </div>
        <div>
          <label className="block text-[11px] text-[#7D5B5980] font-[600] mb-1">Text and Icon</label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2 flex-1 min-w-0">
              <label
                className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
                style={{ backgroundColor: textColor }}
              >
                <input
                  type="color"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  value={textColor}
                  onChange={(e) => {
                    setTextColor(e.target.value);
                    pushField('textColor', e.target.value);
                  }}
                />
              </label>
              <input
                className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] leading-none text-[#7D5B59]"
                value={textColor.replace('#', '').toUpperCase()}
                onChange={(e) => {
                  const hex = e.target.value.replace('#', '');
                  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
                    const next = '#' + hex;
                    setTextColor(next);
                    pushField('textColor', next);
                  }
                }}
                maxLength={6}
              />
              <div className="w-[2px] self-stretch -my-2 bg-white shrink-0 ml-auto" />
              <Scrubbable
                className="flex items-baseline gap-0.5 shrink-0 pl-1"
                min={0}
                max={100}
                value={textOpacity}
                onScrub={(v) => {
                  setTextOpacity(v);
                  pushField('textOpacity', v);
                }}
              >
                <input
                  className="w-[32px] bg-transparent outline-none text-right font-[600] text-[16px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  type="number"
                  min={0}
                  max={100}
                  value={textOpacity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTextOpacity(v);
                    pushField('textOpacity', v);
                  }}
                />
                <span className="font-[600] text-[16px] leading-none text-[#B98587]">%</span>
              </Scrubbable>
            </div>
            <button type="button" title="Revert Text and Icon" aria-label="Revert Text and Icon" onClick={revertText} className={colorIconBtnCls}>
              <RevertIcon />
            </button>
            <button type="button" title="Invert Text and Icon" aria-label="Invert Text and Icon" onClick={invertText} className={colorIconBtnCls}>
              <InvertIcon />
            </button>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] text-[#7D5B5980] font-[600]">Circle</label>
            <FillTypeSelect
              label="Circle"
              value={isGradientValue(circleColor) ? circleColor.type : 'solid'}
              onChange={(mode) => changeColorMode('circleColor', circleColor, setCircleColor, mode)}
            />
          </div>
          {isGradientValue(circleColor) ? (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <GradientEditor
                  value={circleColor}
                  onChange={(g) => {
                    setCircleColor(g);
                    pushField('circleColor', g);
                  }}
                />
              </div>
              <button type="button" title="Revert Circle" aria-label="Revert Circle" onClick={revertCircle} className={colorIconBtnCls}>
                <RevertIcon />
              </button>
              <button type="button" title="Invert Circle" aria-label="Invert Circle" onClick={invertCircle} className={colorIconBtnCls}>
                <InvertIcon />
              </button>
            </div>
          ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2 flex-1 min-w-0">
              <label
                className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
                style={{ backgroundColor: circleColor }}
              >
                <input
                  type="color"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  value={circleColor}
                  onChange={(e) => {
                    setCircleColor(e.target.value);
                    pushField('circleColor', e.target.value);
                  }}
                />
              </label>
              <input
                className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] leading-none text-[#7D5B59]"
                value={circleColor.replace('#', '').toUpperCase()}
                onChange={(e) => {
                  const hex = e.target.value.replace('#', '');
                  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
                    const next = '#' + hex;
                    setCircleColor(next);
                    pushField('circleColor', next);
                  }
                }}
                maxLength={6}
              />
              <div className="w-[2px] self-stretch -my-2 bg-white shrink-0 ml-auto" />
              <Scrubbable
                className="flex items-baseline gap-0.5 shrink-0 pl-1"
                min={0}
                max={100}
                value={circleOpacity}
                onScrub={(v) => {
                  setCircleOpacity(v);
                  pushField('circleOpacity', v);
                }}
              >
                <input
                  className="w-[32px] bg-transparent outline-none text-right font-[600] text-[16px] leading-none text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  type="number"
                  min={0}
                  max={100}
                  value={circleOpacity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCircleOpacity(v);
                    pushField('circleOpacity', v);
                  }}
                />
                <span className="font-[600] text-[16px] leading-none text-[#B98587]">%</span>
              </Scrubbable>
            </div>
            <button type="button" title="Revert Circle" aria-label="Revert Circle" onClick={revertCircle} className={colorIconBtnCls}>
              <RevertIcon />
            </button>
            <button type="button" title="Invert Circle" aria-label="Invert Circle" onClick={invertCircle} className={colorIconBtnCls}>
              <InvertIcon />
            </button>
          </div>
          )}
        </div>
        <button
          onClick={handleSave}
          className="mt-2 py-2 rounded-md bg-[#8C6B6B] text-white font-semibold"
        >
          Save
        </button>
      </div>
      )}
    </div>
  );
}

// A blank account card — what "Add another account" drops in.
const emptyGiftAccount = (): GiftAccount => ({
  bank: '',
  account: '',
  image: null,
  qrSize: QR_DEFAULT_SIZE,
});

function MoneyGiftTab({ rules }: { rules: PackageRules }) {
  const { eventData, updateEventData, setSection } = useEventData();
  const current = eventData.moneyGift;
  // "Show Money Gift" — ON ⇒ Money Gift is offered in the invitation footer.
  // Defaults to ON unless explicitly turned off, so existing designs are
  // unaffected. Purely a visibility switch: the accounts below are left
  // untouched when it goes off, and come straight back when it is turned on
  // again.
  const [giftOn, setGiftOn] = useState(current?.enabled !== false);
  // One entry per place guests can send a gift — bank, number, QR and that QR's
  // size travel together, in the order guests swipe through them. Always at
  // least one card on screen, even before anything is filled in.
  const [accounts, setAccounts] = useState<GiftAccount[]>(() => {
    const saved = giftAccounts(current);
    return saved.length > 0 ? saved : [emptyGiftAccount()];
  });

  const pushField = (patch: Partial<NonNullable<typeof current>>) => {
    updateEventData('moneyGift', patch as any);
  };

  const toggleGift = () => {
    const next = !giftOn;
    setGiftOn(next);
    // Merge-patch: only `enabled` changes, so the saved accounts survive being
    // hidden and reappear intact when switched back on.
    pushField({ enabled: next });
  };

  // Every write goes through here so the legacy single-account fields (which
  // canvas `eventBinding`s and already-published invitations still read) stay
  // mirrored from the first account.
  const commitAccounts = (next: GiftAccount[]) => {
    setAccounts(next);
    pushField({ accounts: next, ...legacyGiftFields(next) });
  };

  const patchAccount = (index: number, patch: Partial<GiftAccount>) => {
    commitAccounts(accounts.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const addAccount = () => {
    if (accounts.length >= GIFT_MAX_ACCOUNTS) return;
    commitAccounts([...accounts, emptyGiftAccount()]);
  };

  const removeAccount = (index: number) => {
    const next = accounts.filter((_, i) => i !== index);
    commitAccounts(next.length > 0 ? next : [emptyGiftAccount()]);
  };

  // Reorder = change the swipe order guests see.
  const moveAccount = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= accounts.length) return;
    const next = [...accounts];
    [next[index], next[target]] = [next[target], next[index]];
    commitAccounts(next);
  };

  const handleQrUpload = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Let the same file be picked again after a remove.
    e.target.value = '';
    if (!file) return;
    downscaleImageFile(file).then((dataUrl) => patchAccount(index, { image: dataUrl }));
  };

  const handleSave = () => {
    // Blank trailing cards are dropped rather than saved — an account with no
    // bank, no number and no QR would render as an empty slide for guests.
    const filled = accounts.filter(
      (a) => String(a.bank ?? '').trim() || String(a.account ?? '').trim() || a.image,
    );
    if (filled.length === 0) {
      alert('Please fill in at least one bank account.');
      return;
    }
    const incomplete = filled.findIndex(
      (a) => !String(a.bank ?? '').trim() || !String(a.account ?? '').trim(),
    );
    if (incomplete !== -1) {
      alert(`Please fill in the bank name and account number for account ${incomplete + 1}.`);
      return;
    }
    setAccounts(filled);
    setSection('moneyGift', {
      accounts: filled,
      ...legacyGiftFields(filled),
      enabled: giftOn,
    });
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-4">Money Gift</div>

      <div className="flex items-center justify-between mb-3">
        <label className="text-xs text-gray-600">Show Money Gift</label>
        <button
          type="button"
          role="switch"
          aria-checked={giftOn}
          aria-label="Show Money Gift"
          title={giftOn ? 'Hide Money Gift' : 'Show Money Gift'}
          onClick={toggleGift}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            giftOn ? 'bg-[#8C6B6B]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              giftOn ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>

      {/* Package rules outrank the toggle — it can hide a feature the package
          includes, never unlock one it doesn't. */}
      {!rules.showRsvpAndMoneyGift ? (
        <div className="mb-3 rounded-md bg-[#FBF1EC] border border-[#E7C9BC] px-3 py-2 text-[11px] font-semibold text-[#8C5B3F]">
          {UPGRADE_MESSAGES.moneyGift}
        </div>
      ) : !giftOn ? (
        <div className="mb-3 rounded-md bg-[#F2E8E6] border border-[#E4D3CE] px-3 py-2 text-[11px] font-semibold text-[#7D5B59]">
          Money Gift is hidden from the invitation footer. Your bank details and QR are kept.
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {accounts.length > 1 && (
          <p className="text-[11px] text-gray-500">
            Guests swipe between these in this order — use the arrows to reorder.
          </p>
        )}

        {accounts.map((acc, i) => (
          <div key={i} className="rounded-md border border-[#E4D3CE] bg-[#FDFAF9] p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#7D5B59]">
                Account {i + 1}
                {accounts.length > 1 ? ` of ${accounts.length}` : ''}
              </span>
              <div className="flex items-center gap-1">
                {accounts.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => moveAccount(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move account ${i + 1} earlier`}
                      title="Move earlier"
                      className="px-1 text-sm text-[#7D5B59] disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAccount(i, 1)}
                      disabled={i === accounts.length - 1}
                      aria-label={`Move account ${i + 1} later`}
                      title="Move later"
                      className="px-1 text-sm text-[#7D5B59] disabled:opacity-30"
                    >
                      ›
                    </button>
                  </>
                )}
                {/* Only when there is something to remove — the tab always keeps
                    one card on screen, so an × on a lone card would do nothing
                    visible. */}
                {accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAccount(i)}
                    aria-label={`Remove account ${i + 1}`}
                    title="Remove account"
                    className="h-5 w-5 rounded-full bg-[#8C6B6B] text-white text-[11px] leading-none shadow"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <input
              value={acc.bank ?? ''}
              onChange={(e) => patchAccount(i, { bank: e.target.value })}
              placeholder="Bank"
              className="px-3 py-2 border rounded-md text-sm bg-white"
            />
            {/* Text, not number: account numbers can carry leading zeros and are
                never arithmetic. */}
            <input
              inputMode="numeric"
              value={String(acc.account ?? '')}
              onChange={(e) => patchAccount(i, { account: e.target.value })}
              placeholder="Account Number"
              className="px-3 py-2 border rounded-md text-sm bg-white"
            />

            {acc.image ? (
              <div className="flex items-center gap-3">
                <div className="relative rounded-md border bg-white p-1">
                  <img src={acc.image} alt={`QR for account ${i + 1}`} className="w-16 h-16 object-contain" />
                  <button
                    type="button"
                    onClick={() => patchAccount(i, { image: null })}
                    aria-label={`Remove QR for account ${i + 1}`}
                    title="Remove QR"
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[#8C6B6B] text-white text-[11px] leading-none shadow"
                  >
                    ×
                  </button>
                </div>
                <label className="text-xs text-[#7D5B59] font-semibold underline cursor-pointer">
                  <input type="file" accept="image/*" onChange={handleQrUpload(i)} className="hidden" />
                  Replace QR
                </label>
              </div>
            ) : (
              <label className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-white">
                <input type="file" accept="image/*" onChange={handleQrUpload(i)} className="hidden" />
                <div className="text-sm text-gray-500">
                  Drag or drop QR image,<br />or browse files
                </div>
              </label>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-[#191212] font-semibold">QR size</label>
                <span className="text-xs text-[#7D5B59] font-semibold">
                  {acc.qrSize ?? QR_DEFAULT_SIZE}px
                </span>
              </div>
              <input
                type="range"
                min={QR_MIN_SIZE}
                max={QR_MAX_SIZE}
                step={5}
                value={acc.qrSize ?? QR_DEFAULT_SIZE}
                onChange={(e) => patchAccount(i, { qrSize: Number(e.target.value) })}
                className="w-full accent-[#8C6B6B] cursor-pointer"
              />
            </div>
          </div>
        ))}

        {accounts.length < GIFT_MAX_ACCOUNTS ? (
          <button
            type="button"
            onClick={addAccount}
            className="py-2 rounded-md border border-[#8C6B6B] text-[#8C6B6B] text-sm font-semibold hover:bg-[#F7EFEC]"
          >
            + Add another account
          </button>
        ) : (
          <p className="text-[11px] text-gray-500 text-center">
            Money Gift holds up to {GIFT_MAX_ACCOUNTS} accounts.
          </p>
        )}

        <button
          onClick={handleSave}
          className="mt-2 py-2 rounded-md bg-[#8C6B6B] text-white font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function WishlistTab({ editorRef: _editorRef }: { editorRef?: React.RefObject<EditorHandle | null> }) {
  const [items, setItems] = useState([{ address: '', phone: '', link: '' }]);

  const handleAdd = () => {
    setItems((prev) => [...prev, { address: '', phone: '', link: '' }]);
  };

  const handleChange = (index: number, field: 'address' | 'phone' | 'link', value: string) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleSave = () => {
    const valid = items.every(i => i.address && i.phone && i.link);
    if (!valid) {
      alert("Please fill all fields");
      return;
    }
    console.log("Wishlist:", items);
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-4">Wishlist</div>
      <div className="flex flex-col gap-4">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 border-b pb-3">
            <input
              value={item.address}
              onChange={(e) => handleChange(i, 'address', e.target.value)}
              placeholder="Delivery Address"
              className="px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="number"
              value={item.phone}
              onChange={(e) => handleChange(i, 'phone', e.target.value)}
              placeholder="Phone Number"
              className="px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="url"
              value={item.link}
              onChange={(e) => handleChange(i, 'link', e.target.value)}
              placeholder="Item's Link"
              className="px-3 py-2 border rounded-md text-sm"
            />
          </div>
        ))}
        <button
          onClick={handleAdd}
          className="py-2 border rounded-md text-sm font-semibold hover:bg-gray-100"
        >
          + Add Item
        </button>
        <button
          onClick={handleSave}
          className="mt-2 py-2 rounded-md bg-[#8C6B6B] text-white font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// LockedTab disabled — all tabs are now unlocked
// function LockedTab() {
//   return (
//     <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
//       <span className="text-4xl">🔒</span>
//       <p className="text-[15px] font-[600] text-[#7D5B59]">Premium Feature</p>
//       <p className="text-[12px] text-[#7D5B5980]">
//         Upgrade your package to unlock<br />this feature.
//       </p>
//     </div>
//   );
// }

// PowerPoint-style "Format Background" panel. Lets the user fill the canvas
// background with a solid color or an uploaded picture, then fine-tune the
// picture (tile as texture, fit, scale, offset, transparency, mirror). All
// changes are pushed live to the editor, which applies them to every page.
type BgFit = 'cover' | 'contain' | 'stretch';
type BgMirror = 'none' | 'horizontal' | 'vertical' | 'both';

// Backstore size of the editor canvas (mirror of CANVAS_REF_* in CanvasEditor).
// Background offsets are stored in canvas pixels, so a drag inside the small
// sidebar preview is scaled by (canvas width / preview width) to move the real
// background 1:1 with the pointer.
const BG_CANVAS_W = 396;
// Zoom (scroll) clamps for the interactive background pad.
const BG_SCALE_MIN = 10;
const BG_SCALE_MAX = 1000;
const clampBgScale = (v: number) => Math.max(BG_SCALE_MIN, Math.min(BG_SCALE_MAX, v));

const BG_SWATCHES = [
  '#ffffff', '#f5e8dd', '#fde2e4', '#fad2e1',
  '#e2eafc', '#d0f4de', '#fff1ba', '#1f2937',
];

// Figma-style scrubbable number field: hovering the label or box shows an
// ew-resize cursor and a horizontal drag adjusts the value (`step` per px),
// while a plain click (<3px movement) still focuses the input for normal
// typing. While focused, a string draft backs the input so partial entries
// like "-" or "-5" aren't coerced to 0 mid-keystroke, and drags inside the
// focused input keep selecting text instead of scrubbing.
function NumberField({
  label, value, onChange, min, max, step = 1, suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const scrubbedRef = React.useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  };

  const startScrub = (e: React.PointerEvent) => {
    if (e.button !== 0 || document.activeElement === inputRef.current) return;
    const startX = e.clientX;
    const startValue = value;
    let active = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!active) {
        if (Math.abs(dx) < 3) return;
        active = true;
        scrubbedRef.current = true;
        inputRef.current?.blur();
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
      }
      ev.preventDefault();
      onChange(clamp(Math.round(startValue + dx * step)));
    };
    const end = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (active) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const commitDraft = () => {
    if (draft !== null) {
      const n = Number(draft);
      if (draft.trim() !== '' && Number.isFinite(n)) onChange(clamp(n));
    }
    setDraft(null);
  };

  return (
    <label
      className={`flex flex-col gap-1 ${editing ? '' : 'cursor-ew-resize'}`}
      onPointerDown={startScrub}
      onClickCapture={(e) => {
        // Swallow the click that ends a scrub so the label doesn't focus the input.
        if (scrubbedRef.current) {
          scrubbedRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <span className="text-[11px] text-[#7D5B5980] font-[600] select-none">{label}</span>
      <div className="flex items-center bg-[#F2E8E6B2] border border-[#EDE2DE] rounded-[10px] px-2.5 py-1.5">
        <input
          ref={inputRef}
          type="number"
          value={draft ?? value}
          min={min}
          max={max}
          step={step}
          onFocus={() => setDraft(String(value))}
          onBlur={commitDraft}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            const n = Number(raw);
            if (raw.trim() !== '' && Number.isFinite(n)) onChange(clamp(n));
          }}
          className={`flex-1 min-w-0 bg-transparent outline-none text-[13px] font-[600] text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
            editing ? 'cursor-text' : 'cursor-ew-resize'
          }`}
        />
        {suffix && <span className="text-[12px] text-[#B98587] font-[600] pl-1 select-none">{suffix}</span>}
      </div>
    </label>
  );
}

function BackgroundTab({
  editorRef,
  readNonce,
}: {
  editorRef?: React.RefObject<EditorHandle | null>;
  readNonce?: number;
}) {
  const [fillType, setFillType] = useState<'color' | 'picture'>('color');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [src, setSrc] = useState<string | null>(null);
  const [tile, setTile] = useState(false);
  const [fit, setFit] = useState<BgFit>('cover');
  const [scaleX, setScaleX] = useState(100);
  const [scaleY, setScaleY] = useState(100);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [transparency, setTransparency] = useState(0);
  const [mirror, setMirror] = useState<BgMirror>('none');
  const fileRef = React.useRef<HTMLInputElement>(null);
  // When we pull settings FROM the editor we must not bounce them straight back
  // (that would push history snapshots on every page switch). This skips the one
  // apply that the sync's state updates would otherwise trigger.
  const suppressApplyRef = React.useRef(false);

  // Mirror the active page's background into the panel — on first open and after
  // every page (re)load. Reads what's actually applied so the panel always shows
  // the current page's image (or nothing for a blank page).
  useEffect(() => {
    const rb = editorRef?.current?.getBackground?.();
    if (!rb) return;
    suppressApplyRef.current = true;
    if (rb.kind === 'image') {
      const o = rb.opts;
      setFillType('picture');
      setSrc(rb.src);
      setTile(!!o.tile);
      setFit(o.fit ?? 'cover');
      setScaleX(Math.round((o.scaleX ?? 1) * 100));
      setScaleY(Math.round((o.scaleY ?? 1) * 100));
      setOffsetX(Math.round(o.offsetX ?? 0));
      setOffsetY(Math.round(o.offsetY ?? 0));
      setTransparency(Math.round((1 - (o.opacity ?? 1)) * 100));
      setMirror(
        o.flipX && o.flipY ? 'both' : o.flipX ? 'horizontal' : o.flipY ? 'vertical' : 'none',
      );
    } else if (rb.kind === 'color') {
      setFillType('color');
      setBgColor(rb.color);
      setSrc(null);
    } else {
      // Blank page — clear the picture but leave the fill mode as-is so the user
      // can drop a new image straight in.
      setSrc(null);
    }
    // Clear the guard after the apply effect has had its chance to run-and-skip.
    const id = setTimeout(() => { suppressApplyRef.current = false; }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readNonce]);

  // ── Drag-to-position / scroll-to-zoom pad ──────────────────────────────────
  // The client found the numeric Scale/Offset fields fiddly, so the preview box
  // doubles as an interactive pad: dragging pans the background (updates offset),
  // scrolling zooms it (updates scale). Both feed the same state the numeric
  // fields use AND push to the canvas live (rAF-throttled) during the gesture —
  // the applyKey effect's debounce only fires after motion stops, which would
  // leave the canvas frozen mid-drag.
  const padRef = React.useRef<HTMLDivElement>(null);
  const [padW, setPadW] = useState(0);
  const [padH, setPadH] = useState(0);
  const dragRef = React.useRef<{ px: number; py: number; ox: number; oy: number; factor: number } | null>(null);
  // Refs mirror the latest scale + opts builder so the native wheel listener
  // (bound once per src) never reads a stale closure after other edits.
  const scaleXRef = React.useRef(scaleX);
  const scaleYRef = React.useRef(scaleY);
  scaleXRef.current = scaleX;
  scaleYRef.current = scaleY;
  const buildOptsRef = React.useRef<(() => ReturnType<typeof buildOpts>) | undefined>(undefined);
  const liveRafRef = React.useRef<number | null>(null);
  const liveOptsRef = React.useRef<ReturnType<typeof buildOpts> | null>(null);

  // Coalesce live canvas updates to one per animation frame during a gesture.
  const scheduleLiveApply = (opts: ReturnType<typeof buildOpts>) => {
    liveOptsRef.current = opts;
    if (liveRafRef.current != null) return;
    liveRafRef.current = requestAnimationFrame(() => {
      liveRafRef.current = null;
      if (src && liveOptsRef.current) editorRef?.current?.setBackgroundImage?.(src, liveOptsRef.current);
    });
  };
  useEffect(() => () => {
    if (liveRafRef.current != null) cancelAnimationFrame(liveRafRef.current);
  }, []);

  // Keep the drag→canvas scale factor current with the pad's rendered width.
  useEffect(() => {
    const el = padRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPadW(r.width);
      setPadH(r.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);

  // Scroll-to-zoom. Registered natively (not via onWheel) so preventDefault can
  // stop the sidebar from scrolling under the gesture — React wheel handlers are
  // passive and can't cancel.
  useEffect(() => {
    const el = padRef.current;
    if (!el || !src) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 1.05 : 1 / 1.05;
      const nsx = clampBgScale(Math.round(scaleXRef.current * step));
      const nsy = clampBgScale(Math.round(scaleYRef.current * step));
      scaleXRef.current = nsx;
      scaleYRef.current = nsy;
      setScaleX(nsx);
      setScaleY(nsy);
      scheduleLiveApply({ ...(buildOptsRef.current?.() ?? buildOpts()), scaleX: nsx / 100, scaleY: nsy / 100 });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const onPadPointerDown = (e: React.PointerEvent) => {
    // Let the Replace/Remove buttons keep working — don't start a drag on them.
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = padRef.current?.getBoundingClientRect();
    const factor = rect && rect.width ? BG_CANVAS_W / rect.width : 1;
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offsetX, oy: offsetY, factor };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPadPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const nox = Math.round(d.ox + (e.clientX - d.px) * d.factor);
    const noy = Math.round(d.oy + (e.clientY - d.py) * d.factor);
    setOffsetX(nox);
    setOffsetY(noy);
    scheduleLiveApply({ ...buildOpts(), offsetX: nox, offsetY: noy });
  };
  const onPadPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  // Double-click recenters + resets zoom, an easy escape from an awkward drag.
  const resetPadTransform = () => {
    setOffsetX(0);
    setOffsetY(0);
    setScaleX(100);
    setScaleY(100);
    scaleXRef.current = 100;
    scaleYRef.current = 100;
  };

  // ── Resize handles (fabric-style) ──────────────────────────────────────────
  // Eight handles ride the background image's bounding box inside the preview so
  // resizing feels like manipulating an object on the canvas. Each handle pins
  // the opposite edge/corner and drags its own edge to the pointer, then maps the
  // new box back to the same Scale X/Y + Offset X/Y state the numeric fields use
  // (and pushes live to the canvas via the shared rAF-throttled applier).
  const resizeRef = React.useRef<
    { handle: string; L: number; T: number; R: number; B: number; padLeft: number; padTop: number } | null
  >(null);

  // The background image's current bounding box inside the preview, in pad pixels.
  // Same math as padTransform: scaled about the pad centre, then shifted by offset.
  const bgRectW = padW * (scaleX / 100);
  const bgRectH = padH * (scaleY / 100);
  const bgCx = padW / 2 + (offsetX * padW) / BG_CANVAS_W;
  const bgCy = padH / 2 + (offsetY * padW) / BG_CANVAS_W;
  const bgLeft = bgCx - bgRectW / 2;
  const bgTop = bgCy - bgRectH / 2;

  const onHandleDown = (e: React.PointerEvent, handle: string) => {
    // Don't let the pad's body-drag (move) also start.
    e.stopPropagation();
    e.preventDefault();
    const pr = padRef.current?.getBoundingClientRect();
    if (!pr) return;
    resizeRef.current = {
      handle,
      L: bgLeft,
      T: bgTop,
      R: bgLeft + bgRectW,
      B: bgTop + bgRectH,
      padLeft: pr.left,
      padTop: pr.top,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || padW <= 0 || padH <= 0) return;
    const px = e.clientX - r.padLeft;
    const py = e.clientY - r.padTop;
    let { L, T, R, B } = r;
    const { handle } = r;
    // Move only the edges this handle owns; the rest stay pinned (the anchor).
    if (handle.includes('w')) L = px;
    if (handle.includes('e')) R = px;
    if (handle.includes('n')) T = py;
    if (handle.includes('s')) B = py;
    // Clamp to the scale bounds, then rebuild the box from the pinned edge so the
    // anchor never drifts even when the size hits its min/max.
    const nsx = clampBgScale(Math.round(((R - L) / padW) * 100));
    const nsy = clampBgScale(Math.round(((B - T) / padH) * 100));
    const clW = (padW * nsx) / 100;
    const clH = (padH * nsy) / 100;
    const cx = handle.includes('w') ? R - clW / 2 : handle.includes('e') ? L + clW / 2 : (L + R) / 2;
    const cy = handle.includes('n') ? B - clH / 2 : handle.includes('s') ? T + clH / 2 : (T + B) / 2;
    const nox = Math.round(((cx - padW / 2) * BG_CANVAS_W) / padW);
    const noy = Math.round(((cy - padH / 2) * BG_CANVAS_W) / padW);
    scaleXRef.current = nsx;
    scaleYRef.current = nsy;
    setScaleX(nsx);
    setScaleY(nsy);
    setOffsetX(nox);
    setOffsetY(noy);
    scheduleLiveApply({
      ...(buildOptsRef.current?.() ?? buildOpts()),
      scaleX: nsx / 100,
      scaleY: nsy / 100,
      offsetX: nox,
      offsetY: noy,
    });
  };
  const onHandleUp = (e: React.PointerEvent) => {
    resizeRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // Corner + edge handles: fx/fy are fractions of the box, cursor hints the axis.
  const BG_HANDLES: { id: string; fx: number; fy: number; cursor: string }[] = [
    { id: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
    { id: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
    { id: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
    { id: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
    { id: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
    { id: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
    { id: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
    { id: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
  ];

  // Approximate the canvas transform inside the preview so the little image moves
  // 1:1 with the pointer while dragging (offset px ÷ the same drag factor).
  const padTransform =
    padW > 0
      ? `translate(${(offsetX * padW) / BG_CANVAS_W}px, ${(offsetY * padW) / BG_CANVAS_W}px) scale(${scaleX / 100}, ${scaleY / 100})`
      : undefined;

  // The current adjustment controls packaged for the editor API.
  const buildOpts = () => ({
    tile,
    fit,
    scaleX: scaleX / 100,
    scaleY: scaleY / 100,
    offsetX,
    offsetY,
    opacity: 1 - transparency / 100,
    flipX: mirror === 'horizontal' || mirror === 'both',
    flipY: mirror === 'vertical' || mirror === 'both',
  });
  // Expose the freshest opts builder to the wheel listener (bound once per src).
  buildOptsRef.current = buildOpts;

  // Background changes affect ONLY the active page by default; "Apply to all
  // pages" re-runs the current fill across every page.
  const applyColor = (c: string) => {
    setBgColor(c);
    setFillType('color');
    setSrc(null);
    editorRef?.current?.setBackgroundColor?.(c);
  };

  const applyToAll = () => {
    if (fillType === 'picture' && src) {
      editorRef?.current?.setBackgroundImage?.(src, buildOpts(), 'all');
    } else {
      editorRef?.current?.setBackgroundColor?.(bgColor, 'all');
    }
  };

  // Re-apply the picture to the active page whenever any setting changes (lightly
  // debounced so dragging a slider doesn't serialize the canvas on every pixel).
  const applyKey = `${src}|${tile}|${fit}|${scaleX}|${scaleY}|${offsetX}|${offsetY}|${transparency}|${mirror}`;
  useEffect(() => {
    if (fillType !== 'picture' || !src) return;
    // Don't echo a sync-from-editor change back to the canvas.
    if (suppressApplyRef.current) { suppressApplyRef.current = false; return; }
    const id = setTimeout(() => {
      editorRef?.current?.setBackgroundImage?.(src, buildOpts());
    }, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyKey, fillType]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.currentTarget;
    if (!file) return;
    downscaleImageFile(file).then((dataUrl) => {
      // Start each new picture from clean defaults so the result is predictable.
      setTile(false);
      setFit('cover');
      setScaleX(100);
      setScaleY(100);
      setOffsetX(0);
      setOffsetY(0);
      setTransparency(0);
      setMirror('none');
      setFillType('picture');
      setSrc(dataUrl);
    });
    input.value = '';
  };

  // Clear the panel controls back to their starting state.
  const clearPanelState = () => {
    setTile(false);
    setFit('cover');
    setScaleX(100);
    setScaleY(100);
    setOffsetX(0);
    setOffsetY(0);
    setTransparency(0);
    setMirror('none');
    setSrc(null);
  };

  // "Remove" on the picture preview: drop the background from THIS page only.
  const removeCurrent = () => {
    clearPanelState();
    editorRef?.current?.setBackgroundImage?.(null);
  };

  // "Reset adjustments": cancel the whole "Apply to all pages" effect — clears the
  // background from every page and stops newly created pages from inheriting it.
  const resetAdjustments = () => {
    clearPanelState();
    editorRef?.current?.setBackgroundImage?.(null, undefined, 'all');
  };

  const fillTabCls = (active: boolean) =>
    `flex-1 py-1.5 rounded-[10px] text-[12px] font-[600] transition-colors ${
      active ? 'bg-[#8C6B6B] text-white' : 'bg-[#F2E8E6B2] text-[#7D5B59] hover:bg-[#EDE2DE]'
    }`;

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-3">Background</div>

      {/* Fill type */}
      <div className="flex gap-2 mb-4">
        <button type="button" className={fillTabCls(fillType === 'color')} onClick={() => applyColor(bgColor)}>
          Solid color
        </button>
        <button type="button" className={fillTabCls(fillType === 'picture')} onClick={() => setFillType('picture')}>
          Picture
        </button>
      </div>

      {fillType === 'color' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {BG_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyColor(color)}
                title={color}
                aria-label={`Set background to ${color}`}
                className={`w-7 h-7 rounded-full border hover:scale-110 transition ${
                  bgColor.toLowerCase() === color.toLowerCase() ? 'border-[#8C6B6B] ring-2 ring-[#8C6B6B]/40' : 'border-gray-300'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <label className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2">
            <span
              className="relative inline-block w-6 h-6 rounded-[5px] border border-[#EDE2DE] cursor-pointer overflow-hidden shrink-0"
              style={{ backgroundColor: bgColor }}
            >
              <input
                type="color"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={bgColor}
                onChange={(e) => applyColor(e.target.value)}
              />
            </span>
            <input
              className="flex-1 min-w-0 bg-transparent outline-none uppercase tracking-tight font-[600] text-[13px] text-[#7D5B59]"
              value={bgColor.replace('#', '').toUpperCase()}
              maxLength={6}
              onChange={(e) => {
                const hex = e.target.value.replace('#', '');
                if (/^[0-9a-fA-F]{6}$/.test(hex)) applyColor('#' + hex);
              }}
            />
          </label>
          <button
            type="button"
            onClick={applyToAll}
            className="mt-1 py-2 rounded-md bg-[#8C6B6B] text-white text-[13px] font-semibold hover:opacity-90 transition"
          >
            Apply to all pages
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Picture source */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          {!src ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="block border-2 border-dashed border-gray-300 rounded-md p-5 text-center text-xs text-gray-500 cursor-pointer hover:bg-gray-50 hover:border-[#8C6B6B] transition"
            >
              Click to upload a background picture
            </button>
          ) : (
            <div
              ref={padRef}
              onPointerDown={onPadPointerDown}
              onPointerMove={onPadPointerMove}
              onPointerUp={onPadPointerUp}
              onPointerCancel={onPadPointerUp}
              onDoubleClick={resetPadTransform}
              title="Drag to move · Scroll to zoom · Double-click to reset"
              className="relative w-full aspect-9/16 rounded border border-gray-200 overflow-hidden bg-gray-50 cursor-grab active:cursor-grabbing touch-none select-none"
            >
              <img
                src={src}
                alt="Current background"
                draggable={false}
                style={{ transform: padTransform }}
                className="w-full h-full object-cover pointer-events-none will-change-transform"
              />
              <div className="absolute top-1 right-1 z-20 flex gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-2 py-0.5 rounded bg-white/90 text-[10px] font-semibold text-[#7D5B59] border border-[#EDE2DE] hover:bg-white transition"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={removeCurrent}
                  title="Remove background from this page"
                  className="px-2 py-0.5 rounded bg-white/90 text-[10px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition"
                >
                  Remove
                </button>
              </div>
              <div className="absolute bottom-1 left-1 right-1 flex justify-center pointer-events-none">
                <span className="rounded bg-black/40 text-white text-[9px] font-semibold px-1.5 py-0.5">
                  Drag to move · Handles or scroll to resize
                </span>
              </div>

              {/* Fabric-style selection box + resize handles over the image. */}
              {padW > 0 && padH > 0 && (
                <>
                  <div
                    className="absolute pointer-events-none border border-[#8C6B6B]"
                    style={{ left: bgLeft, top: bgTop, width: bgRectW, height: bgRectH }}
                  />
                  {BG_HANDLES.map((hd) => (
                    <div
                      key={hd.id}
                      onPointerDown={(e) => onHandleDown(e, hd.id)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                      className="absolute z-10 w-2.5 h-2.5 rounded-xs bg-white border border-[#8C6B6B] shadow-sm"
                      style={{
                        left: bgLeft + hd.fx * bgRectW,
                        top: bgTop + hd.fy * bgRectH,
                        transform: 'translate(-50%, -50%)',
                        cursor: hd.cursor,
                        touchAction: 'none',
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {src && (
            <>
              {/* Tile as texture */}
              <label className="flex items-center justify-between">
                <span className="text-[12px] text-[#7D5B59] font-[600]">Tile picture as texture</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={tile}
                  onClick={() => setTile((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    tile ? 'bg-[#8C6B6B]' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      tile ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </label>

              {/* Fit (single picture only) */}
              {!tile && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[#7D5B5980] font-[600]">Fit</span>
                  <select
                    value={fit}
                    onChange={(e) => setFit(e.target.value as BgFit)}
                    className="px-3 py-2 border border-gray-200 rounded-[10px] text-[13px] bg-white text-[#7D5B59] font-[600]"
                  >
                    <option value="cover">Fill (cover)</option>
                    <option value="contain">Fit (contain)</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </label>
              )}

              {/* Transparency — not applied to tiled textures */}
              {!tile && (
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#7D5B5980] font-[600]">Transparency</span>
                    <span className="text-[11px] text-[#7D5B59] font-[600]">{transparency}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={transparency}
                    onChange={(e) => setTransparency(Number(e.target.value))}
                    className="w-full accent-[#8C6B6B]"
                  />
                </label>
              )}

              {/* Scale */}
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Scale X" value={scaleX} onChange={setScaleX} min={-1000} max={1000} suffix="%" />
                <NumberField label="Scale Y" value={scaleY} onChange={setScaleY} min={-1000} max={1000} suffix="%" />
              </div>

              {/* Offset */}
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Offset X" value={offsetX} onChange={setOffsetX} suffix="px" />
                <NumberField label="Offset Y" value={offsetY} onChange={setOffsetY} suffix="px" />
              </div>

              {/* Mirror */}
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[#7D5B5980] font-[600]">Mirror type</span>
                <select
                  value={mirror}
                  onChange={(e) => setMirror(e.target.value as BgMirror)}
                  className="px-3 py-2 border border-gray-200 rounded-[10px] text-[13px] bg-white text-[#7D5B59] font-[600]"
                >
                  <option value="none">None</option>
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                  <option value="both">Both</option>
                </select>
              </label>

              <div className="mt-1 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={applyToAll}
                  className="py-2 rounded-md bg-[#8C6B6B] text-white text-[13px] font-semibold hover:opacity-90 transition"
                >
                  Apply to all pages
                </button>
                <button
                  type="button"
                  onClick={resetAdjustments}
                  title="Remove the background from all pages (cancels Apply to all)"
                  className="py-2 rounded-md border border-[#EDE2DE] text-[12px] font-[600] text-[#7D5B59] hover:bg-[#F2E8E6B2] transition"
                >
                  Reset adjustments
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TemplatesTab({ editorRef }: { editorRef?: React.RefObject<EditorHandle | null> }) {
  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-3">Templates</div>
      <div className="grid grid-cols-2 gap-3">
        {TEMPLATE_LIST.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => {
              if (editorRef?.current?.loadTemplate) {
                editorRef.current.loadTemplate(tpl.pages);
              }
            }}
            className="border rounded p-2 hover:shadow text-left"
          >
            <div className="text-sm font-semibold">{tpl.name}</div>
            <div className="text-xs text-gray-500">{tpl.pages.length} pages</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────────

export default function Sidebar({
  editorRef,
  isPhonePreview = false,
  onEditImage,
  bgReadNonce,
  showRsvpAndMoneyGift = true,
  teaser = false,
  rules,
  featureUsage,
  onLocationChanged,
  activeTool,
  onActiveToolChange,
}: {
  editorRef?: React.RefObject<EditorHandle | null>;
  // Optional controlled tool selection. Passed by ProjectEditor so the phone
  // inspector can close the tool sheet when an element is selected; omit both
  // and the sidebar keeps the selection in its own state.
  activeTool?: Tab | null;
  onActiveToolChange?: (tab: Tab | null) => void;
  isPhonePreview?: boolean;
  onEditImage?: (src: string, onReplace: (dataUrl: string) => void) => void;
  // Bumped by the parent whenever the active page reloads, so the Background
  // panel can re-read and display that page's background.
  bgReadNonce?: number;
  // Package gating (Basic / package_id === 1 hides RSVP + Money Gift). Defaults
  // to true so non-event usages (free designer canvas) keep both tools visible.
  showRsvpAndMoneyGift?: boolean;
  // Teaser (public "try the editor") mode. Greys out RSVP + Money Gift and
  // makes them inert — clicking does NOT open the tool panel (upsell preview).
  teaser?: boolean;
  // Opens the package upgrade modal. Accepted for compatibility with callers;
  // the sidebar no longer gates RSVP / Money Gift behind it (both stay usable).
  onUpgrade?: () => void;
  // Full package rule set (gallery/location/music limits). Absent for free
  // designer canvases — defaults to full access (all limits Infinity).
  rules?: PackageRules;
  // Persisted location/music change counters from designs.json_data.
  featureUsage?: FeatureUsage;
  // Called after a real, successful location change so the parent increments +
  // persists the counter.
  onLocationChanged?: () => void;
}) {
  // Free/legacy canvases pass no rules → full access.
  const pkgRules = rules ?? getPackageRules(null);
  const usage = featureUsage ?? EMPTY_FEATURE_USAGE;
  const [internalActive, setInternalActive] = useState<Tab | null>(null);
  const toolControlled = activeTool !== undefined;
  const active = toolControlled ? activeTool : internalActive;
  const setActive = (next: Tab | null | ((prev: Tab | null) => Tab | null)) => {
    const value = typeof next === 'function' ? next(active) : next;
    if (toolControlled) onActiveToolChange?.(value);
    else setInternalActive(value);
  };
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [bgColor, setBgColor] = useState<string>('#ffffff');

  // User-uploaded Graphics / Stickers for the Elements tab. Kept per-category in
  // component state; once a thumbnail is added to the canvas it is serialized
  // into the design JSON (and saved to the DB) like any other image — so these
  // do not need their own persistence.
  const [customAssets, setCustomAssets] = useState<{ Graphics: string[]; Stickers: string[] }>({
    Graphics: [],
    Stickers: [],
  });
  const elementsFileRef = React.useRef<HTMLInputElement>(null);
  const uploadTargetRef = React.useRef<'Graphics' | 'Stickers'>('Graphics');

  // Downscale each uploaded image (same helper the Photo gallery uses) and append
  // it to the category that opened the picker. Sequential chain preserves order.
  const handleElementUpload = (files: FileList | null) => {
    if (!files) return;
    const cat = uploadTargetRef.current;
    let chain: Promise<unknown> = Promise.resolve();
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      chain = chain
        .then(() => downscaleImageFile(file))
        .then((dataUrl) => {
          setCustomAssets((prev) => ({ ...prev, [cat]: [...prev[cat], dataUrl as string] }));
        });
    });
  };

  const openElementUpload = (cat: 'Graphics' | 'Stickers') => {
    uploadTargetRef.current = cat;
    if (elementsFileRef.current) elementsFileRef.current.value = '';
    elementsFileRef.current?.click();
  };

  const removeCustomAsset = (cat: 'Graphics' | 'Stickers', index: number) => {
    setCustomAssets((prev) => ({ ...prev, [cat]: prev[cat].filter((_, j) => j !== index) }));
  };

  // Quick background-color swatch used by the Elements tab's "Color" category.
  // Full background controls (image, adjustments) live in the Background tab.
  const applyBackgroundColor = (color: string) => {
    setBgColor(color);
    if (editorRef?.current?.setBackgroundColor) {
      editorRef.current.setBackgroundColor(color);
    }
  };

  const getItemsForCategory = (cat: string) => {
    if (cat === 'Shapes') return ['Circle', 'Ellipse', 'Line', 'Polygon', 'Polyline', 'Rect', 'Triangle'];
    return Array.from({ length: 6 }).map((_, i) => `${cat} ${i + 1}`);
  };

  const renderShapeIcon = (shape: string) => {
    const s = shape.toLowerCase();
    const base = { width: 48, height: 48, viewBox: '0 0 48 48' };
    switch (s) {
      case 'circle':
        return (
          <svg {...base} className="w-10 h-10" aria-hidden>
            <circle cx="24" cy="24" r="12" fill="black" stroke="#111827" strokeWidth="1" />
          </svg>
        );
      case 'ellipse':
        return (
          <svg {...base} className="w-10 h-10" aria-hidden>
            <ellipse cx="24" cy="24" rx="16" ry="10" fill="#F3F4F6" stroke="#111827" strokeWidth="1" />
          </svg>
        );
      case 'line':
        return (
          <svg {...base} className="w-10 h-10" aria-hidden>
            <line x1="8" y1="40" x2="40" y2="8" stroke="#111827" strokeWidth="3" strokeLinecap="round" />
          </svg>
        );
      case 'polygon':
        return (
          <svg {...base} className="w-10 h-10" aria-hidden>
            <polygon points="24,6 40,24 24,42 8,24" fill="#E6E6FA" stroke="#111827" strokeWidth="1" />
          </svg>
        );
      case 'polyline':
        return (
          <svg {...base} className="w-10 h-10" aria-hidden>
            <polyline points="8,30 18,12 28,30 38,12" fill="none" stroke="#111827" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'rect':
        return (
          <svg {...base} className="w-10 h-10" aria-hidden>
            <rect x="9" y="12" width="30" height="24" rx="2" fill="#F9FAFB" stroke="#111827" strokeWidth="1" />
          </svg>
        );
      case 'triangle':
        return (
          <svg {...base} className="w-10 h-10" aria-hidden>
            <polygon points="24,8 40,36 8,36" fill="#F3F4F6" stroke="#111827" strokeWidth="1" />
          </svg>
        );
      default:
        return <div className="w-10 h-10 bg-gray-100" />;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Teaser + Basic grey out RSVP + Money Gift. In teaser they are inert —
  // clicking must NOT open the tool panel (it's an upsell preview). For Basic
  // they stay fully functional. Other tiers show them normally.
  const rsvpMoneyGreyed = teaser || pkgRules.isBasicPackage;

  const toggle = (id: Tab, disabled?: boolean) => {
    if (disabled) return;
    // Teaser: RSVP + Money Gift are shown but not interactive — don't open them.
    if (teaser && (id === 'rsvp' || id === 'money')) return;
    if (id === 'text') {
      setActive(null);
      // Drop a fresh text box in the centre of the canvas, ready to edit.
      editorRef?.current?.addText?.();
      return;
    }
    // Premium lock disabled — all tabs accessible
    // if (PREMIUM_TABS.includes(id) && !isPremium) {
    //   setActive(id);
    //   return;
    // }
    setActive((prev) => (prev === id ? null : id));
  };

  const iconNav = (
    <aside className="bg-brand-cream transition-all duration-200 w-24 lg:w-30 h-full overflow-y-auto shrink-0">
      <nav className="flex flex-col gap-2 pt-4">
        {SIDEBAR_ITEMS.map((it) => {
          // Teaser + Basic grey out RSVP + Money Gift. In teaser they are also
          // inert (see toggle), so show a not-allowed cursor there.
          const isRsvpOrMoney = it.id === 'rsvp' || it.id === 'money';
          const isGreyed = isRsvpOrMoney && rsvpMoneyGreyed;
          const isInert = isRsvpOrMoney && teaser;
          return (
            <button
              key={it.id}
              onClick={() => toggle(it.id, it.disabled)}
              aria-pressed={active === it.id}
              className={`relative flex flex-col items-center justify-center gap-4 text-left text-[13px] text-nowrap font-semibold px-3 py-2 rounded hover:bg-brand-accent/30 ${
                isInert ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                it.disabled ? 'opacity-50 cursor-not-allowed' : ''
              } ${isGreyed ? 'opacity-40' : ''} ${active === it.id ? 'bg-brand-accent/40' : ''}`}
            >
              <div className="flex items-center justify-center gap-4 relative">
                <img src={it.icon} alt={it.label.toLowerCase()} className="h-6 w-8.5" />
              </div>
              {it.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );

  // Body of the active tool panel, without any layout chrome. The desktop
  // sidebar wraps it in a fixed-width column; the phone toolbar renders the same
  // nodes inside its slide-up sheet.
  const panelBody = active ? (
    <>
      {(PREVIEW_TABS as readonly string[]).includes(active) && (
        <LivePreviewPanel activeTab={active as PreviewTabName} />
      )}
      {active === 'elements' ? (
        <div>
          {/* Shared hidden picker for Graphics / Stickers uploads. The target
              category is set via uploadTargetRef before .click(). */}
          <input
            ref={elementsFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleElementUpload(e.target.files)}
          />
          <div className="flex flex-col gap-4">
            {/* Interactive elements — drop a fully-functional countdown or
                guestbook onto the current page (click or drag). */}
            <div className="mb-3">
              <div className="text-[#191212] text-[17px] font-bold mb-2">Interactive</div>
              <div className="grid grid-cols-2 gap-2">
                {INTERACTIVE_ELEMENTS.map((el) => (
                  <button
                    key={el.id}
                    draggable
                    onDragStart={(e) => {
                      const payload = JSON.stringify({ type: 'element', element: el.id });
                      try { e.dataTransfer.setData('application/json', payload); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { }
                    }}
                    onClick={() => {
                      if (el.id === 'countdown') editorRef?.current?.addCountdown?.();
                      else editorRef?.current?.addGuestbook?.();
                    }}
                    title={`Add ${el.label} to canvas`}
                    aria-label={`Add ${el.label} to canvas`}
                    className="h-24 bg-gray-100 rounded flex flex-col items-center justify-center gap-2 text-[12px] font-semibold text-[#7D5B59] hover:bg-gray-200 transition"
                  >
                    {el.icon}
                    <span>{el.label}</span>
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-gray-400 text-center mt-2">
                Click to add · drag onto the page to place.
              </div>
            </div>

            {['Shapes', 'Graphics', 'Stickers', 'Color'].map((cat) => (
              <div key={cat} className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-[#191212] text-[17px] font-bold">{cat}</div>
                    {cat === 'Color' && (
                      <label
                        className="relative inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 cursor-pointer overflow-hidden"
                        title="Pick background color"
                      >
                        <span
                          aria-hidden
                          className="absolute inset-0"
                          style={{ backgroundColor: bgColor }}
                        />
                        <input
                          type="color"
                          value={bgColor}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => applyBackgroundColor(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                  {cat === 'Shapes' && (
                    <button
                      onClick={() => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))}
                      className="text-[#BBA8A7] text-[10px] font-bold"
                      aria-expanded={!!expanded[cat]}
                    >
                      {expanded[cat] ? 'Show Less' : 'See All'}
                    </button>
                  )}
                </div>
                {cat === 'Color' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      '#ffffff', '#f5e8dd', '#fde2e4', '#fad2e1',
                      '#e2eafc', '#d0f4de', '#fff1ba', '#1f2937',
                    ].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => applyBackgroundColor(color)}
                        title={color}
                        aria-label={`Set background to ${color}`}
                        className="w-7 h-7 rounded-full border border-gray-300 hover:scale-110 transition"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                )}
                {cat === 'Shapes' && (
                <div className="mt-2">
                  <div className="grid grid-cols-3 gap-2">
                    {getItemsForCategory(cat).slice(0, expanded[cat] ? undefined : 3).map((item, i) => (
                      <button
                        key={String(item) + i}
                        draggable
                        onDragStart={(e) => {
                          const payload = JSON.stringify({
                            type: 'shape',
                            shape: String(item).toLowerCase(),
                            label: String(item),
                          });
                          try { e.dataTransfer.setData('application/json', payload); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { }
                        }}
                        onClick={() => {
                          const shape = String(item).toLowerCase();
                          // Line is a draw tool, not a drop-in shape: click the
                          // canvas to anchor, drag to stretch, release to place.
                          if (shape === 'line' && editorRef?.current?.enterLineTool) {
                            editorRef.current.enterLineTool();
                            return;
                          }
                          if (editorRef?.current?.addShape) editorRef.current.addShape(shape);
                        }}
                        title={String(item) === 'Line' ? 'Line — click the canvas, move, click again (or drag)' : String(item)}
                        aria-label={String(item)}
                        className="h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-600 hover:bg-gray-200"
                      >
                        <div className="flex items-center justify-center w-full h-full">
                          {renderShapeIcon(String(item))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                )}

                {/* Graphics / Stickers — user uploads their own images. Each is
                    downscaled then added to the canvas (double-click or drag),
                    after which it persists with the design like any other image. */}
                {(cat === 'Graphics' || cat === 'Stickers') && (() => {
                  const key = cat as 'Graphics' | 'Stickers';
                  const assets = customAssets[key];
                  const noun = cat === 'Graphics' ? 'Graphic' : 'Sticker';
                  return (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => openElementUpload(key)}
                        className="w-full px-3 py-2 bg-gray-100 rounded text-sm font-medium hover:bg-gray-200 transition mb-2"
                      >
                        + Upload {noun}
                      </button>
                      {assets.length === 0 ? (
                        <div className="text-[11px] text-gray-400 text-center py-2">
                          Upload your own {noun.toLowerCase()}s to use them here.
                        </div>
                      ) : (
                        <>
                          <div className="text-[11px] text-gray-400 text-center mb-2">
                            Double-click to add to canvas · drag onto the page.
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {assets.map((src, i) => (
                              <div key={`${key}-${i}`} className="relative group">
                                <img
                                  src={src}
                                  alt={`${noun}-${i}`}
                                  draggable
                                  onDoubleClick={() => editorRef?.current?.addImageFromUrl?.(src)}
                                  onDragStart={(e) => {
                                    const payload = JSON.stringify({ type: 'image-url', url: src });
                                    try { e.dataTransfer.setData('application/json', payload); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { }
                                  }}
                                  title="Double-click to add to canvas · drag onto the page"
                                  className="w-full h-20 object-contain rounded border bg-gray-50 p-1 cursor-pointer hover:opacity-80 transition"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeCustomAsset(key, i)}
                                  aria-label={`Remove ${noun}`}
                                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white border border-gray-300 text-gray-500 text-[12px] leading-none opacity-0 group-hover:opacity-100 transition flex items-center justify-center hover:bg-gray-100"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ) : active === 'background' ? (
        <BackgroundTab editorRef={editorRef} readNonce={bgReadNonce} />
      ) : active === 'photo' ? (
        <PhotoTab editorRef={editorRef} onEditImage={onEditImage} rules={pkgRules} />
      ) : active === 'music' ? (
        <MusicTab
          editorRef={editorRef}
          rules={pkgRules}
          musicChanges={normalizeUsageCounter(usage.music).count}
        />
      ) : active === 'contact' ? (
        <ContactTab />
      ) : active === 'location' ? (
        <LocationTab
          rules={pkgRules}
          locationChanges={normalizeUsageCounter(usage.location).count}
          onLocationChanged={onLocationChanged}
        />
      ) : active === 'calendar' ? (
        <CalendarTab />
      ) : active === 'rsvp' ? (
        <RSVPTab />
      ) : active === 'money' ? (
        <MoneyGiftTab rules={pkgRules} />
      ) : active === 'wishlist' ? (
        <WishlistTab editorRef={editorRef} />
      ) : active === 'templates' ? (
        <TemplatesTab editorRef={editorRef} />
      ) : (
        <div className="text-sm text-gray-600">
          <p className="mb-2">Content for {SIDEBAR_ITEMS.find((s) => s.id === active)?.label} will appear here.</p>
          <p className="text-xs text-gray-400">Click a category to view items.</p>
        </div>
      )}
    </>
  ) : null;

  const tabPanel = panelBody ? (
    <aside className="w-60 lg:w-72 p-3 lg:p-4 border-r border-[#BBA8A7] transition-all duration-200 h-full overflow-y-auto shrink-0">
      {panelBody}
    </aside>
  ) : null;

  if (isPhonePreview) {
    return (
      <div className="relative h-full shrink-0">
        {/* Arrow tab — always visible on the right edge */}
        <button
          onClick={() => setPhoneOpen((prev) => !prev)}
          className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-full z-50 flex items-center justify-center w-5 h-12 bg-brand-cream border border-[#BBA8A7] border-l-0 rounded-r-lg shadow-sm"
          aria-label={phoneOpen ? "Close sidebar" : "Open sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 8 14"
            fill="none"
            className={`w-3 h-3 transition-transform duration-200 ${phoneOpen ? "rotate-180" : ""}`}
          >
            <path d="M1 1l6 6-6 6" stroke="#7D5B59" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Sliding panel */}
        <div
          className={`flex h-full overflow-hidden transition-all duration-200 ${
            phoneOpen ? "w-auto" : "w-0"
          }`}
        >
          {iconNav}
          {tabPanel}
        </div>

        {/* Phone viewport still gets the bottom rail + slide-up sheet. */}
        <MobileToolbar
          activeTab={active}
          onTabChange={(id) => toggle(id, SIDEBAR_ITEMS.find((s) => s.id === id)?.disabled)}
          onClose={() => setActive(null)}
          contentComponent={panelBody}
          greyedTabs={rsvpMoneyGreyed ? ['rsvp', 'money'] : undefined}
        />
      </div>
    );
  }

  return (
    <>
      <div className="hidden pc:flex h-full">
        {iconNav}
        {tabPanel}
      </div>

      {/* Phone: the rail lives at the bottom of the screen and the selected
          tool's panel slides up over the canvas. Same `active` state as the
          desktop sidebar, so the two can never disagree. */}
      <MobileToolbar
        activeTab={active}
        onTabChange={(id) => toggle(id, SIDEBAR_ITEMS.find((s) => s.id === id)?.disabled)}
        onClose={() => setActive(null)}
        contentComponent={panelBody}
        greyedTabs={rsvpMoneyGreyed ? ['rsvp', 'money'] : undefined}
      />
    </>
  );
}
