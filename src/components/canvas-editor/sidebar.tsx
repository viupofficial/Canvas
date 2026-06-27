// updated
import React, { useEffect, useState } from 'react';
import type { EditorHandle } from '@/src/components/CanvasEditor';
import { useEventData } from '@/src/store/EventDataContext';
import LivePreviewPanel from '@/src/components/canvas-editor/LivePreviewPanel';
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
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5" />
        <path d="M9 2h6" />
      </svg>
    ),
  },
  {
    id: 'guestbook',
    label: 'Guestbook',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" />
        <path d="M8 4v16" />
        <path d="M11 9h5M11 13h5" />
      </svg>
    ),
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
}: {
  editorRef?: React.RefObject<EditorHandle | null>;
  onEditImage?: (src: string, onReplace: (dataUrl: string) => void) => void;
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
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      chain = chain
        .then(() => downscaleImageFile(file))
        .then((dataUrl) => {
          setPhotos((prev) => [...prev, dataUrl]);
          // Grow the gallery page with each newly uploaded photo (FIFO order).
          // No-op if no gallery page exists.
          editorRef?.current?.addPhotoToGallery?.(dataUrl);
        });
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
        onClick={() => fileInputRef.current?.click()}
        className="w-full px-3 py-2 bg-gray-100 rounded text-sm font-medium hover:bg-gray-200 transition mb-3"
      >
        + Upload Images
      </button>
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

function MusicTab({ editorRef }: { editorRef?: React.RefObject<EditorHandle | null> }) {
  const [url, setUrl] = useState("");

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-3">Add Music</div>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => {
            if (editorRef?.current?.uploadMusic) {
              editorRef.current.uploadMusic();
            }
          }}
          className="px-3 py-2 bg-gray-100 rounded text-left"
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
              if (editorRef?.current?.addMusicFromUrl) {
                editorRef.current.addMusicFromUrl(url.trim());
              }
              setUrl("");
            }}
            className="px-3 py-1 bg-brand-accent text-[#5a2d2d] rounded"
          >
            Add
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Paste a direct audio link or a YouTube URL (youtube.com or youtu.be).
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
      <div className="text-[#191212] text-[17px] font-bold mb-4">Contact</div>
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

function LocationTab() {
  const { eventData, setSection } = useEventData();
  const [address, setAddress] = useState(eventData.location?.address ?? '');

  const handleChange = (value: string) => {
    setAddress(value);
    setSection('location', value ? { address: value } : null);
  };

  const handleSave = () => {
    if (!address) {
      alert("Please enter a location");
      return;
    }
    setSection('location', { address });
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-4">Location</div>
      <div className="flex flex-col gap-3">
        <input
          value={address}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Location Address"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#BBA8A7]"
        />
        <button
          onClick={handleSave}
          className="mt-2 py-2 rounded-md bg-[#8C6B6B] text-white font-semibold hover:opacity-90 transition"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function CalendarTab() {
  const { eventData, setSection, updateEventData } = useEventData();
  const [date, setDate] = useState(eventData.calendar?.date ?? '');
  const [title, setTitle] = useState(eventData.calendar?.title ?? '');
  const [startTime, setStartTime] = useState(eventData.calendar?.startTime ?? '');
  const [endTime, setEndTime] = useState(eventData.calendar?.endTime ?? '');
  const [reminder, setReminder] = useState<number | ''>(
    typeof eventData.calendar?.reminderMinutes === 'number'
      ? eventData.calendar.reminderMinutes
      : '',
  );

  const handleDateChange = (value: string) => {
    setDate(value);
    if (value) {
      updateEventData('calendar', { date: value });
    } else {
      setSection('calendar', null);
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
  const [maxGuest, setMaxGuest] = useState<number | ''>(current?.maxGuest ?? '');
  const [navColor, setNavColor] = useState(current?.navColor ?? '#000000');
  const [navOpacity, setNavOpacity] = useState(current?.navOpacity ?? 100);
  const [textColor, setTextColor] = useState(current?.textColor ?? '#000000');
  const [textOpacity, setTextOpacity] = useState(current?.textOpacity ?? 100);

  const pushField = <K extends keyof NonNullable<typeof current>>(
    field: K,
    value: NonNullable<typeof current>[K],
  ) => {
    updateEventData('rsvpConfig', { [field]: value } as any);
  };

  // Original colors captured once, so each Revert restores the starting value.
  const origNavColor = React.useRef(current?.navColor ?? '#000000');
  const origNavOpacity = React.useRef(current?.navOpacity ?? 100);
  const origTextColor = React.useRef(current?.textColor ?? '#000000');
  const origTextOpacity = React.useRef(current?.textOpacity ?? 100);

  const revertNav = () => {
    setNavColor(origNavColor.current);
    pushField('navColor', origNavColor.current);
    setNavOpacity(origNavOpacity.current);
    pushField('navOpacity', origNavOpacity.current);
  };
  const invertNav = () => {
    const inv = invertHex(navColor);
    setNavColor(inv);
    pushField('navColor', inv);
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

  const handleSave = () => {
    if (!maxGuest) {
      alert("Please enter max guest");
      return;
    }
    setSection('rsvpConfig', { maxGuest, navColor, navOpacity, textColor, textOpacity });
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-4">RSVP</div>
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
        <div>
          <label className="block text-[11px] text-[#7D5B5980] font-[600] mb-1">Navigation Bar</label>
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
              <div className="flex items-baseline gap-0.5 shrink-0 pl-1">
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
              </div>
            </div>
            <button type="button" title="Revert Navigation Bar" aria-label="Revert Navigation Bar" onClick={revertNav} className={colorIconBtnCls}>
              <RevertIcon />
            </button>
            <button type="button" title="Invert Navigation Bar" aria-label="Invert Navigation Bar" onClick={invertNav} className={colorIconBtnCls}>
              <InvertIcon />
            </button>
          </div>
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
              <div className="flex items-baseline gap-0.5 shrink-0 pl-1">
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
              </div>
            </div>
            <button type="button" title="Revert Text and Icon" aria-label="Revert Text and Icon" onClick={revertText} className={colorIconBtnCls}>
              <RevertIcon />
            </button>
            <button type="button" title="Invert Text and Icon" aria-label="Invert Text and Icon" onClick={invertText} className={colorIconBtnCls}>
              <InvertIcon />
            </button>
          </div>
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

function MoneyGiftTab() {
  const { eventData, updateEventData, setSection } = useEventData();
  const current = eventData.moneyGift;
  const [bank, setBank] = useState(current?.bank ?? '');
  const [account, setAccount] = useState<number | ''>(
    (current?.account as number | '' | undefined) ?? ''
  );
  const [image, setImage] = useState<string | null>(current?.image ?? null);

  const pushField = (patch: Partial<NonNullable<typeof current>>) => {
    updateEventData('moneyGift', patch as any);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    downscaleImageFile(file).then((dataUrl) => {
      setImage(dataUrl);
      pushField({ image: dataUrl });
    });
  };

  const handleSave = () => {
    if (!bank || !account) {
      alert("Please fill all fields");
      return;
    }
    setSection('moneyGift', { bank, account, image });
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-4">Money Gift</div>
      <div className="flex flex-col gap-3">
        <input
          value={bank}
          onChange={(e) => {
            setBank(e.target.value);
            pushField({ bank: e.target.value });
          }}
          placeholder="Bank"
          className="px-3 py-2 border rounded-md text-sm"
        />
        <input
          type="number"
          value={account}
          onChange={(e) => {
            const v = Number(e.target.value);
            setAccount(v);
            pushField({ account: v });
          }}
          placeholder="Account Number"
          className="px-3 py-2 border rounded-md text-sm"
        />
        <label className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-gray-50">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          {image ? (
            <img src={image} alt="preview" className="w-full h-32 object-contain" />
          ) : (
            <div className="text-sm text-gray-500">
              Drag or drop images,<br />or browse files
            </div>
          )}
        </label>
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

const BG_SWATCHES = [
  '#ffffff', '#f5e8dd', '#fde2e4', '#fad2e1',
  '#e2eafc', '#d0f4de', '#fff1ba', '#1f2937',
];

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
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-[#7D5B5980] font-[600]">{label}</span>
      <div className="flex items-center bg-[#F2E8E6B2] border border-[#EDE2DE] rounded-[10px] px-2.5 py-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-[600] text-[#7D5B59] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-[12px] text-[#B98587] font-[600] pl-1">{suffix}</span>}
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
            <div className="relative h-28 rounded border border-gray-200 overflow-hidden">
              <img src={src} alt="Current background" className="w-full h-full object-cover" />
              <div className="absolute top-1 right-1 flex gap-1">
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
                <NumberField label="Scale X" value={scaleX} onChange={setScaleX} min={1} max={1000} suffix="%" />
                <NumberField label="Scale Y" value={scaleY} onChange={setScaleY} min={1} max={1000} suffix="%" />
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
}: {
  editorRef?: React.RefObject<EditorHandle | null>;
  isPhonePreview?: boolean;
  onEditImage?: (src: string, onReplace: (dataUrl: string) => void) => void;
  // Bumped by the parent whenever the active page reloads, so the Background
  // panel can re-read and display that page's background.
  bgReadNonce?: number;
  // Package gating (Basic / package_id === 1 hides RSVP + Money Gift). Defaults
  // to true so non-event usages (free designer canvas) keep both tools visible.
  showRsvpAndMoneyGift?: boolean;
}) {
  const [active, setActive] = useState<Tab | null>(null);
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

  const toggle = (id: Tab, disabled?: boolean) => {
    if (disabled) return;
    if (id === 'text') {
      setActive(null);
      editorRef?.current?.enterTextTool?.();
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
    <aside className="bg-brand-cream transition-all duration-200 w-30 h-full overflow-y-auto shrink-0">
      <nav className="flex flex-col gap-2 pt-4">
        {SIDEBAR_ITEMS.filter(
          (it) => showRsvpAndMoneyGift || (it.id !== 'rsvp' && it.id !== 'money'),
        ).map((it) => {
          const isLocked = false; // Premium lock disabled
          return (
            <button
              key={it.id}
              onClick={() => toggle(it.id, it.disabled)}
              aria-pressed={active === it.id}
              className={`relative flex flex-col items-center justify-center gap-4 text-left text-[13px] text-nowrap font-semibold px-3 py-2 rounded hover:bg-brand-accent/30 cursor-pointer ${
                it.disabled ? 'opacity-50 cursor-not-allowed' : ''
              } ${active === it.id ? 'bg-brand-accent/40' : ''}`}
            >
              <div className="flex items-center justify-center gap-4 relative">
                <img src={it.icon} alt={it.label.toLowerCase()} className={`h-6 w-8.5 ${isLocked ? 'opacity-40' : ''}`} />
                {isLocked && (
                  <span className="absolute -top-1 -right-2 text-[10px]">🔒</span>
                )}
              </div>
              {it.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );

  const tabPanel = active ? (
    <aside className="w-72 p-4 border-r border-[#BBA8A7] transition-all duration-200 h-full overflow-y-auto shrink-0">
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
                          if (editorRef?.current?.addShape) editorRef.current.addShape(String(item).toLowerCase());
                        }}
                        title={String(item)}
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
        <PhotoTab editorRef={editorRef} onEditImage={onEditImage} />
      ) : active === 'music' ? (
        <MusicTab editorRef={editorRef} />
      ) : active === 'contact' ? (
        <ContactTab />
      ) : active === 'location' ? (
        <LocationTab />
      ) : active === 'calendar' ? (
        <CalendarTab />
      ) : active === 'rsvp' ? (
        <RSVPTab />
      ) : active === 'money' ? (
        <MoneyGiftTab />
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
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {iconNav}
      {tabPanel}
    </div>
  );
}
