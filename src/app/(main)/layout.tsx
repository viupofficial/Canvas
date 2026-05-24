import React from "react";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream text-brand-dark">
      <div className="w-full mx-auto">{children}</div>
    </div>
  );
}
