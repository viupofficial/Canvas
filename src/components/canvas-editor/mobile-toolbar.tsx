"use client";
import React, { useRef } from 'react';
import { X } from 'lucide-react';

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

interface MobileToolbarProps {
  activeTab: Tab | null;
  onTabChange: (tab: Tab) => void;
  /**
   * Panel body for the active tab — the same content the desktop sidebar shows
   * in its second column. Rendered in a sheet that slides up from the rail so
   * the tool's controls sit over the canvas instead of beside it.
   */
  contentComponent?: React.ReactNode;
  /** Closes the sheet (backdrop tap, X button). */
  onClose?: () => void;
  /** Tabs to render dimmed (package/teaser gating). Still tappable — the
   *  parent's handler decides whether the tap does anything. */
  greyedTabs?: Tab[];
}

const TOOLBAR_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'templates', label: 'Templates', icon: '/template.svg' },
  { id: 'elements', label: 'Elements', icon: '/elements.svg' },
  { id: 'background', label: 'Background', icon: '/background.svg' },
  { id: 'text', label: 'Text', icon: '/text.svg' },
  { id: 'photo', label: 'Gallery', icon: '/photo-gallery.svg' },
  { id: 'music', label: 'Music', icon: '/music.svg' },
  { id: 'contact', label: 'Contact', icon: '/contact.svg' },
  { id: 'location', label: 'Location', icon: '/location.svg' },
  { id: 'calendar', label: 'Calendar', icon: '/calendar.svg' },
  { id: 'rsvp', label: 'RSVP', icon: '/rsvp.svg' },
  { id: 'money', label: 'Money Gift', icon: '/money-gift.svg' },
];

export default function MobileToolbar({
  activeTab,
  onTabChange,
  contentComponent,
  onClose,
  greyedTabs,
}: MobileToolbarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // The sheet is only "open" when a tab is selected AND that tab has a panel to
  // show. Tools that act immediately (Text drops a textbox) leave it closed.
  const sheetOpen = !!activeTab && !!contentComponent;
  const activeLabel = TOOLBAR_ITEMS.find((t) => t.id === activeTab)?.label ?? '';
  const isGreyed = (id: Tab) => !!greyedTabs?.includes(id);

  return (
    <>
      {/* Backdrop — sits under the sheet/rail, over the canvas. */}
      <div
        className={`fixed inset-0 bg-black/30 z-30 pc:hidden transition-opacity duration-200 ${
          sheetOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => onClose?.()}
        aria-hidden={!sheetOpen}
      />

      {/* Sheet + rail share one fixed container, so the sheet always sits
          exactly on top of the rail without hard-coded offsets. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pc:hidden">
        {/* Slide-up tool panel */}
        <div
          role="dialog"
          aria-modal="false"
          aria-label={activeLabel}
          className={`bg-[#F8F7F6] rounded-t-[18px] overflow-hidden transition-[max-height] duration-300 ease-out ${
            sheetOpen
              ? 'max-h-[62vh] shadow-[0_-8px_24px_rgba(0,0,0,0.15)]'
              : 'max-h-0'
          }`}
        >
          {/* Grab handle + close. No title here — every tool panel already
              renders its own heading. */}
          <div className="flex items-center px-2 pt-1.5 pb-1 relative">
            <span className="absolute left-1/2 -translate-x-1/2 top-2 h-1 w-9 rounded-full bg-[#BBA8A7]" />
            <button
              onClick={() => onClose?.()}
              className="ml-auto p-1 rounded-full text-[#7D5B59] hover:bg-[#EDE2DE] transition-colors"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>

          {/* Panel body — scrolls inside the sheet. */}
          <div className="overflow-y-auto overscroll-contain max-h-[calc(62vh-38px)] px-3 pb-3">
            {contentComponent}
          </div>
        </div>

        {/* Icon rail — every tool lives here; the row scrolls sideways rather
            than hiding the last few behind an overflow menu. */}
        <div className="bg-white border-t border-[#EDE2DE] h-[var(--mobile-rail-h)]">
          <div
            className="flex items-center gap-0.5 p-2 h-full overflow-x-auto scroll-smooth"
            ref={scrollContainerRef}
          >
            {TOOLBAR_ITEMS.map((item) => (
              <button
                key={item.id}
                data-tab={item.id}
                // Mirrors the desktop rail's attribute — see canvas-tutorial.
                data-tutorial={`tool-${item.id}`}
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[50px] shrink-0 py-2 px-2 rounded-[12px] transition-all ${
                  activeTab === item.id
                    ? 'bg-[#8C6B6B] text-white shadow-md'
                    : 'bg-transparent text-[#7D5B59] hover:bg-[#F2E8E6B2]'
                } ${isGreyed(item.id) ? 'opacity-40' : ''}`}
                title={item.label}
                aria-label={item.label}
                aria-pressed={activeTab === item.id}
              >
                <img
                  src={item.icon}
                  alt={item.label}
                  className="w-5 h-5"
                  style={{
                    filter: activeTab === item.id ? 'brightness(0) invert(1)' : 'none',
                  }}
                />
                <span className="text-[9px] font-medium text-center leading-tight whitespace-nowrap">
                  {item.label.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
