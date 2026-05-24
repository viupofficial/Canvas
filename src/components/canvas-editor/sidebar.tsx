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

type Tab =
  | 'templates'
  | 'elements'
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

const PREMIUM_TABS: Tab[] = ['rsvp', 'money', 'wishlist'];

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

function PhotoTab({ editorRef }: { editorRef?: React.RefObject<EditorHandle | null> }) {
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const addToCanvas = (src: string) => {
    if (editorRef?.current?.addImageFromUrl) {
      editorRef.current.addImageFromUrl(src);
    }
  };

  return (
    <div>
      <div className="text-[#191212] text-[17px] font-bold mb-3">Photos</div>
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
        Double-click a photo to add it to the canvas.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[...DEFAULT_PHOTOS, ...images].map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt={`photo-${i}`}
            draggable
            onDoubleClick={() => addToCanvas(src)}
            onDragStart={(e) => {
              const payload = JSON.stringify({ type: 'image-url', url: src });
              try { e.dataTransfer.setData('application/json', payload); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { }
            }}
            className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition bg-gray-50"
            title="Double-click to add to canvas"
          />
        ))}
      </div>
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
            placeholder="Music URL"
            className="flex-1 px-2 py-1 border rounded"
          />
          <button
            onClick={() => {
              if (!url) return;
              if (editorRef?.current?.addMusicFromUrl) {
                editorRef.current.addMusicFromUrl(url);
              }
              setUrl("");
            }}
            className="px-3 py-1 bg-brand-accent text-white rounded"
          >
            Add
          </button>
        </div>
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
          <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2">
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
        </div>
        <div>
          <label className="block text-[11px] text-[#7D5B5980] font-[600] mb-1">Text and Icon</label>
          <div className="flex items-center gap-3 bg-[#F2E8E6] rounded-[12px] px-3 py-2">
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
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImage(dataUrl);
      pushField({ image: dataUrl });
    };
    reader.readAsDataURL(file);
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

function LockedTab() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="text-4xl">🔒</span>
      <p className="text-[15px] font-[600] text-[#7D5B59]">Premium Feature</p>
      <p className="text-[12px] text-[#7D5B5980]">
        Upgrade your package to unlock<br />this feature.
      </p>
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
  isPremium = false,
  isPhonePreview = false,
}: {
  editorRef?: React.RefObject<EditorHandle | null>;
  isPremium?: boolean;
  isPhonePreview?: boolean;
}) {
  const [active, setActive] = useState<Tab | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [bgColor, setBgColor] = useState<string>('#ffffff');

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
    if (PREMIUM_TABS.includes(id) && !isPremium) {
      setActive(id);
      return;
    }
    setActive((prev) => (prev === id ? null : id));
  };

  const iconNav = (
    <aside className="bg-brand-cream transition-all duration-200 w-30 h-full overflow-y-auto shrink-0">
      <nav className="flex flex-col gap-2 pt-4">
        {SIDEBAR_ITEMS.map((it) => {
          const isLocked = PREMIUM_TABS.includes(it.id) && !isPremium;
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
          <div className="flex flex-col gap-4">
            <div className="mb-3">
              <div className="text-[#191212] text-[17px] font-bold mb-2">Border</div>
              <div className="text-[10px] text-gray-400 mb-2">Click to apply border to all pages</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { src: '/Bordeline.svg', label: 'Borderline' },
                  { src: '/3.png', label: 'Border 2' },
                ].map((border) => (
                  <button
                    key={border.src}
                    onClick={() => {
                      if (editorRef?.current?.addBorder) {
                        editorRef.current.addBorder(border.src);
                      }
                    }}
                    className="relative h-24 rounded border border-gray-200 overflow-hidden hover:border-[#8C6B6B] hover:shadow transition bg-gray-50 flex items-center justify-center"
                    title={`Add ${border.label}`}
                  >
                    <img
                      src={border.src}
                      alt={border.label}
                      className="w-full h-full object-contain p-1"
                    />
                    <span className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-gray-500">
                      {border.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {['Shapes', 'Graphics', 'Stickers', 'Background'].map((cat) => (
              <div key={cat} className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-[#191212] text-[17px] font-bold">{cat}</div>
                    {cat === 'Background' && (
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
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))}
                    className="text-[#BBA8A7] text-[10px] font-bold"
                    aria-expanded={!!expanded[cat]}
                  >
                    {expanded[cat] ? 'Show Less' : 'See All'}
                  </button>
                </div>
                {cat === 'Background' && (
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
                <div className="mt-2">
                  <div className="grid grid-cols-3 gap-2">
                    {getItemsForCategory(cat).slice(0, expanded[cat] ? undefined : 3).map((item, i) => (
                      <button
                        key={String(item) + i}
                        draggable
                        onDragStart={(e) => {
                          const payload = JSON.stringify({
                            type: cat === 'Shapes' ? 'shape' : 'item',
                            shape: cat === 'Shapes' ? String(item).toLowerCase() : undefined,
                            label: String(item),
                          });
                          try { e.dataTransfer.setData('application/json', payload); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { }
                        }}
                        onClick={() => {
                          if (cat === 'Shapes') {
                            if (editorRef?.current?.addShape) editorRef.current.addShape(String(item).toLowerCase());
                          } else {
                            console.log('Add item to canvas (placeholder):', item);
                          }
                        }}
                        title={String(item)}
                        aria-label={String(item)}
                        className="h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-600 hover:bg-gray-200"
                      >
                        {cat === 'Shapes' ? (
                          <div className="flex items-center justify-center w-full h-full">
                            {renderShapeIcon(String(item))}
                          </div>
                        ) : (
                          <div className="text-xs">{item}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : active === 'photo' ? (
        <PhotoTab editorRef={editorRef} />
      ) : active === 'music' ? (
        <MusicTab editorRef={editorRef} />
      ) : active === 'contact' ? (
        <ContactTab />
      ) : active === 'location' ? (
        <LocationTab />
      ) : active === 'calendar' ? (
        <CalendarTab />
      ) : active === 'rsvp' ? (
        !isPremium ? <LockedTab /> : <RSVPTab />
      ) : active === 'money' ? (
        !isPremium ? <LockedTab /> : <MoneyGiftTab />
      ) : active === 'wishlist' ? (
        !isPremium ? <LockedTab /> : <WishlistTab editorRef={editorRef} />
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
