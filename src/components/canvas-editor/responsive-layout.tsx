"use client";
import React, { useState, useRef } from 'react';
import Sidebar from './sidebar';
import MobileToolbar from './mobile-toolbar';

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

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  editorRef?: React.RefObject<any>;
  contacts?: any[];
  moneyGift?: any;
  calendar?: any;
  location?: any;
  rsvpConfig?: any;
  packageId?: number | null;
}

export default function ResponsiveLayout({
  children,
  editorRef,
  contacts = [],
  moneyGift = null,
  calendar = null,
  location = null,
  rsvpConfig = null,
  packageId = null,
}: ResponsiveLayoutProps) {
  const [mobileActiveTab, setMobileActiveTab] = useState<Tab | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const sidebarRef = useRef<any>(null);

  // Get content component based on active tab
  const getContentComponent = (tab: Tab | null) => {
    if (!tab) return null;

    // This would be the actual content from the Sidebar component
    // For now, we'll create a placeholder that can be replaced with actual content
    return (
      <div className="text-[#7D5B59]">
        <p className="text-sm">Content for {tab}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Desktop Layout */}
      <div className="hidden md:flex h-full gap-4">
        {/* Main content area */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>

        {/* Desktop Sidebar */}
        <Sidebar
          editorRef={editorRef}
          contacts={contacts}
          moneyGift={moneyGift}
          calendar={calendar}
          location={location}
          rsvpConfig={rsvpConfig}
          packageId={packageId}
        />
      </div>

      {/* Mobile Layout */}
      <div className="flex flex-col h-full w-full md:hidden">
        {/* Canvas area - takes up space minus toolbar */}
        <div className="flex-1 overflow-auto pb-[160px]">
          {children}
        </div>

        {/* Mobile Toolbar */}
        <MobileToolbar
          activeTab={mobileActiveTab}
          onTabChange={(tab) => {
            setMobileActiveTab(tab);
            setShowMoreMenu(false);
          }}
          contentComponent={getContentComponent(mobileActiveTab)}
          showMore={true}
          onMoreClick={() => setShowMoreMenu(!showMoreMenu)}
        />
      </div>

      {/* More Options Menu Modal */}
      {showMoreMenu && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setShowMoreMenu(false)}>
          <div className="absolute bottom-[180px] right-4 bg-white rounded-lg shadow-lg border border-[#EDE2DE] p-3 max-w-xs">
            <div className="flex flex-col gap-2">
              <button className="text-left px-3 py-2 hover:bg-[#F2E8E6] rounded text-[14px] text-[#7D5B59]">
                Settings
              </button>
              <button className="text-left px-3 py-2 hover:bg-[#F2E8E6] rounded text-[14px] text-[#7D5B59]">
                Preferences
              </button>
              <button className="text-left px-3 py-2 hover:bg-[#F2E8E6] rounded text-[14px] text-[#7D5B59]">
                Help
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
