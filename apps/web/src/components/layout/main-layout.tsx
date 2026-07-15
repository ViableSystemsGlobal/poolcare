"use client";

import { useState, useEffect, memo } from "react";
import Sidebar from "./sidebar";
import { Header } from "./header";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MemoizedSidebar = memo(Sidebar);
const MemoizedHeader = memo(Header);

export function MainLayout({ children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Remember the collapsed choice across reloads.
  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved) setCollapsed(saved === "1");
  }, []);
  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Height is 100vh/0.9 to counter the global `zoom: 0.9` on body, so the
  // shell still fills the viewport with no gap underneath.
  return (
    <div className="flex h-[111.111vh] bg-gray-50">
      <MemoizedSidebar collapsed={collapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MemoizedHeader collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

