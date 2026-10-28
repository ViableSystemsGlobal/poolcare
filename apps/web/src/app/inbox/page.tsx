"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, MessageSquare } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";
import EmailClient from "./email-client";
import MessagesInbox from "./messages-inbox";

type Tab = "email" | "messages";

// useSearchParams needs a Suspense boundary for the production build
export default function InboxPage() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}

function InboxView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "messages" ? "messages" : "email");

  useEffect(() => {
    const t = searchParams.get("tab") === "messages" ? "messages" : "email";
    setTab(t);
  }, [searchParams]);

  const select = (t: Tab) => {
    setTab(t);
    router.replace(t === "email" ? "/inbox" : "/inbox?tab=messages", { scroll: false });
  };

  const tabs: { id: Tab; label: string; icon: typeof Mail }[] = [
    { id: "email", label: "Email", icon: Mail },
    { id: "messages", label: "Client messages", icon: MessageSquare },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500">
            {tab === "email" ? "Your business mailbox — read, reply and send email." : "Conversations with clients across SMS, WhatsApp and the app."}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-white p-1 shadow-sm">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => select(id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === id ? "text-white" : "text-gray-600 hover:bg-gray-50"
              )}
              style={tab === id ? { backgroundColor: accent } : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "email" ? <EmailClient /> : <MessagesInbox />}
    </div>
  );
}
