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
  return (
    <div className="flex h-screen bg-gray-50">
      <MemoizedSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MemoizedHeader />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

