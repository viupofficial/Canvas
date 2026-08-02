"use client";
import React, { useState, useRef } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';

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
}: MobileToolbarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      {/* Mobile Bottom Toolbar - Only show on small screens */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#EDE2DE] z-40 pc:hidden">
        {/* Icon Toolbar */}
        <div
          className="flex items-center gap-0.5 p-2 overflow-x-auto scroll-smooth"
          ref={scrollContainerRef}
        >
          {/* Hamburger Menu */}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[50px] py-2 px-2 rounded-[12px] hover:bg-[#F2E8E6B2] transition-colors text-[#7D5B59]"
            title="Menu"
            aria-label="Menu"
          >
            <Menu size={20} />
            <span className="text-[9px] font-medium">Menu</span>
          </button>

          <div className="w-px h-8 bg-[#EDE2DE] mx-1" />

          {/* Toolbar Icons - Primary tabs */}
          {TOOLBAR_ITEMS.slice(0, 8).map((item) => (
            <button
              key={item.id}
              data-tab={item.id}
              onClick={() => {
                onTabChange(item.id);
                setShowMenu(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[50px] py-2 px-2 rounded-[12px] transition-all ${
                activeTab === item.id
                  ? 'bg-[#8C6B6B] text-white shadow-md'
                  : 'bg-transparent text-[#7D5B59] hover:bg-[#F2E8E6B2]'
              }`}
              title={item.label}
              aria-label={item.label}
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

          {/* More indicator */}
          <div className="flex items-center gap-0.5 min-w-[50px] py-2 px-2 text-[#B98587]">
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {showMenu && (
        <div
          className="fixed inset-0 bg-black/30 z-30 pc:hidden"
          onClick={() => setShowMenu(false)}
        />
      )}

      {/* Mobile Menu Dropdown */}
      {showMenu && (
        <div className="fixed bottom-20 right-4 left-4 bg-white rounded-lg shadow-lg border border-[#EDE2DE] z-40 pc:hidden max-h-64 overflow-y-auto">
          <div className="flex flex-col">
            {TOOLBAR_ITEMS.slice(8).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setShowMenu(false);
                }}
                className={`text-left px-4 py-3 border-b border-[#F2E8E6B2] last:border-b-0 transition-colors ${
                  activeTab === item.id
                    ? 'bg-[#F2E8E6B2] text-[#7D5B59] font-semibold'
                    : 'text-[#7D5B59] hover:bg-[#F9F5F4]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={item.icon}
                    alt={item.label}
                    className="w-5 h-5"
                  />
                  <span className="text-[14px] font-medium">{item.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
