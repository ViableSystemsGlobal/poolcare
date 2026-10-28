"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Folder,
  Search,
  RefreshCw,
  PenSquare,
  Reply,
  ReplyAll,
  Forward,
  Star,
  Mail,
  MailOpen,
  Paperclip,
  Download,
  X,
  Loader2,
  Settings2,
  Plus,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const PAGE_SIZE = 50;

interface Address {
  name: string;
  address: string;
}

interface MailAccount {
  id: string;
  email: string;
  displayName: string | null;
  signature: string | null;
  imapHost: string;
  smtpHost: string;
}

interface MailFolder {
  path: string;
  name: string;
  specialUse: string | null;
  total: number;
  unseen: number;
}

interface MessageSummary {
  uid: number;
  subject: string;
  from: Address | null;
  to: Address[];
  date: string | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
  client: { id: string; name: string } | null;
}

interface MessageDetail {
  uid: number;
  folder: string;
  subject: string;
  from: Address | null;
  to: Address[];
  cc: Address[];
  replyTo: Address[];
  date: string | null;
  flagged: boolean;
  html: string | null;
  text: string | null;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
  client: { id: string; name: string } | null;
}

type ComposeMode = "new" | "reply" | "replyAll" | "forward";

interface ComposeState {
  mode: ComposeMode;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  ref?: MessageDetail;
}

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(", ") : data.message || message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

const folderIcon = (f: MailFolder) => {
  switch (f.specialUse) {
    case "\\Inbox":
      return Inbox;
    case "\\Sent":
      return Send;
    case "\\Drafts":
      return FileText;
    case "\\Trash":
      return Trash2;
    case "\\Junk":
      return AlertOctagon;
    case "\\Archive":
      return Archive;
    default:
      return Folder;
  }
};

const displayName = (a?: Address | null) => (a ? a.name || a.address : "");
const formatAddrs = (list: Address[]) => list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");

function formatListDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function formatFullDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString([], { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textToHtml = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

const prefixed = (prefix: string, subject: string) =>
  new RegExp(`^${prefix}:`, "i").test(subject.trim()) ? subject : `${prefix}: ${subject}`;

// Message bodies render in a sandboxed frame: no scripts, links open in a new tab
function frameDoc(msg: MessageDetail) {
  const body = msg.html || `<pre style="white-space:pre-wrap;font:inherit;margin:0">${escapeHtml(msg.text || "")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{margin:0;padding:4px 2px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827;word-wrap:break-word}
    img{max-width:100%;height:auto} blockquote{margin:0 0 0 .8ex;border-left:2px solid #e5e7eb;padding-left:1ex;color:#4b5563}
    a{color:#2563eb}
  </style></head><body>${body}</body></html>`;
}

export default function EmailClient() {
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [accounts, setAccounts] = useState<MailAccount[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const account = accounts?.find((a) => a.id === accountId) || null;
  const currentFolder = folders.find((f) => f.path === folder);

  const loadAccounts = useCallback(async () => {
    try {
      const list = await api<MailAccount[]>("/mail/accounts");
      setAccounts(list);
      setAccountId((prev) => (prev && list.some((a) => a.id === prev) ? prev : list[0]?.id || null));
    } catch (e: any) {
      setAccounts([]);
      toast({ title: "Couldn't load mailboxes", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  const loadFolders = useCallback(async () => {
    if (!accountId) return;
    try {
      setFolders(await api<MailFolder[]>(`/mail/accounts/${accountId}/folders`));
    } catch (e: any) {
      setListError(e.message);
    }
  }, [accountId]);

  const loadMessages = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (!accountId) return;
      if (!opts.quiet) setLoadingList(true);
      setListError(null);
      try {
        const params = new URLSearchParams({ folder, page: String(page), limit: String(PAGE_SIZE) });
        if (query) params.set("q", query);
        const data = await api<{ items: MessageSummary[]; total: number }>(`/mail/accounts/${accountId}/messages?${params}`);
        setMessages(data.items);
        setTotal(data.total);
      } catch (e: any) {
        setListError(e.message);
        if (!opts.quiet) setMessages([]);
      } finally {
        setLoadingList(false);
      }
    },
    [accountId, folder, page, query]
  );

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    setFolder("INBOX");
    setFolders([]);
    setMessage(null);
    setSelectedUid(null);
    loadFolders();
  }, [accountId, loadFolders]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Pick up new mail every minute while the page is open
  useEffect(() => {
    if (!accountId) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadMessages({ quiet: true });
        loadFolders();
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [accountId, loadMessages, loadFolders]);

  const openMessage = async (uid: number) => {
    if (!accountId) return;
    setSelectedUid(uid);
    setLoadingMessage(true);
    try {
      const detail = await api<MessageDetail>(`/mail/accounts/${accountId}/messages/${uid}?folder=${encodeURIComponent(folder)}`);
      setMessage(detail);
      const wasUnread = messages.find((m) => m.uid === uid && !m.seen);
      setMessages((prev) => prev.map((m) => (m.uid === uid ? { ...m, seen: true } : m)));
      if (wasUnread) setFolders((prev) => prev.map((f) => (f.path === folder ? { ...f, unseen: Math.max(0, f.unseen - 1) } : f)));
    } catch (e: any) {
      toast({ title: "Couldn't open the email", description: e.message, variant: "destructive" });
      setSelectedUid(null);
    } finally {
      setLoadingMessage(false);
    }
  };

  const setFlags = async (uid: number, flags: { seen?: boolean; flagged?: boolean }) => {
    if (!accountId) return;
    setMessages((prev) => prev.map((m) => (m.uid === uid ? { ...m, ...flags } : m)));
    if (message?.uid === uid && flags.flagged !== undefined) setMessage({ ...message, flagged: flags.flagged });
    try {
      await api(`/mail/accounts/${accountId}/messages/${uid}/flags`, { method: "POST", body: JSON.stringify({ folder, ...flags }) });
      if (flags.seen !== undefined) loadFolders();
    } catch (e: any) {
      toast({ title: "Couldn't update the email", description: e.message, variant: "destructive" });
      loadMessages({ quiet: true });
    }
  };

  const markUnread = async (uid: number) => {
    await setFlags(uid, { seen: false });
    if (message?.uid === uid) {
      setMessage(null);
      setSelectedUid(null);
    }
  };

  const deleteMessage = async (uid: number) => {
    if (!accountId) return;
    const inTrash = currentFolder?.specialUse === "\\Trash";
    if (inTrash && !(await confirm({ title: "Delete forever?", description: "This email will be permanently deleted from the mailbox.", destructive: true, confirmLabel: "Delete" }))) return;
    try {
      await api(`/mail/accounts/${accountId}/messages/${uid}?folder=${encodeURIComponent(folder)}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.uid !== uid));
      setTotal((t) => Math.max(0, t - 1));
      if (message?.uid === uid) {
        setMessage(null);
        setSelectedUid(null);
      }
      loadFolders();
      toast({ title: inTrash ? "Email deleted" : "Moved to Trash" });
    } catch (e: any) {
      toast({ title: "Couldn't delete the email", description: e.message, variant: "destructive" });
    }
  };

  const moveMessage = async (uid: number, to: string) => {
    if (!accountId || to === folder) return;
    try {
      await api(`/mail/accounts/${accountId}/messages/${uid}/move`, { method: "POST", body: JSON.stringify({ folder, to }) });
      setMessages((prev) => prev.filter((m) => m.uid !== uid));
      setTotal((t) => Math.max(0, t - 1));
      if (message?.uid === uid) {
        setMessage(null);
        setSelectedUid(null);
      }
      loadFolders();
      toast({ title: `Moved to ${folders.find((f) => f.path === to)?.name || to}` });
    } catch (e: any) {
      toast({ title: "Couldn't move the email", description: e.message, variant: "destructive" });
    }
  };

  const downloadAttachment = async (index: number, filename: string) => {
    if (!accountId || !message) return;
    try {
      const res = await fetch(
        `${API_URL}/mail/accounts/${accountId}/messages/${message.uid}/attachments/${index}?folder=${encodeURIComponent(message.folder)}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` } }
      );
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast({ title: "Couldn't download the attachment", description: e.message, variant: "destructive" });
    }
  };

  const startCompose = (mode: ComposeMode, ref?: MessageDetail) => {
    if (!ref || mode === "new") {
      setCompose({ mode: "new", to: "", cc: "", bcc: "", subject: "", body: "" });
      return;
    }
    const me = account?.email.toLowerCase();
    const replyTarget = ref.replyTo.length ? ref.replyTo : ref.from ? [ref.from] : [];
    if (mode === "forward") {
      setCompose({ mode, to: "", cc: "", bcc: "", subject: prefixed("Fwd", ref.subject), body: "", ref });
      return;
    }
    const to = replyTarget.map((a) => a.address);
    const cc =
      mode === "replyAll"
        ? [...ref.to, ...ref.cc].map((a) => a.address).filter((a) => a.toLowerCase() !== me && !to.includes(a))
        : [];
    setCompose({ mode, to: to.join(", "), cc: cc.join(", "), bcc: "", subject: prefixed("Re", ref.subject), body: "", ref });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const moveTargets = useMemo(() => folders.filter((f) => f.path !== folder), [folders, folder]);

  // ------------------------------------------------------------------ render

  if (accounts === null) {
    return (
      <div className="flex h-[calc(100vh-180px)] items-center justify-center bg-white rounded-xl shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <>
        <div className="flex h-[calc(100vh-180px)] flex-col items-center justify-center bg-white rounded-xl shadow-sm text-center px-6">
          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Connect your mailbox</h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            Read, send and reply to your business email right here. Works with Hostinger and any other IMAP/SMTP mailbox.
          </p>
          <Button className="mt-5 text-white" style={{ backgroundColor: accent }} onClick={() => setConnectOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Connect mailbox
          </Button>
        </div>
        <ConnectDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          accent={accent}
          onConnected={(a) => {
            setAccounts([a]);
            setAccountId(a.id);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-[calc(100vh-180px)] bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Folders */}
      <aside className="w-56 shrink-0 border-r border-gray-100 flex flex-col">
        <div className="p-3 space-y-3">
          <Button className="w-full text-white" style={{ backgroundColor: accent }} onClick={() => startCompose("new")}>
            <PenSquare className="h-4 w-4 mr-2" />
            Compose
          </Button>
          {accounts.length > 1 ? (
            <select
              value={accountId || ""}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          ) : (
            <p className="truncate px-1 text-xs text-gray-500" title={account?.email}>
              {account?.email}
            </p>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {folders.map((f) => {
            const Icon = folderIcon(f);
            const active = f.path === folder;
            return (
              <button
                key={f.path}
                onClick={() => {
                  setFolder(f.path);
                  setPage(1);
                  setMessage(null);
                  setSelectedUid(null);
                }}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "font-medium" : "text-gray-600 hover:bg-gray-50"
                )}
                style={active ? { backgroundColor: `${accent}12`, color: accent } : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{f.name}</span>
                {f.unseen > 0 && f.specialUse !== "\\Sent" && f.specialUse !== "\\Trash" && (
                  <span className="ml-auto text-xs font-semibold">{f.unseen}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 p-2 space-y-1">
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Settings2 className="h-4 w-4" />
            Mailbox settings
          </button>
          <button
            onClick={() => setConnectOpen(true)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Add mailbox
          </button>
        </div>
      </aside>

      {/* Message list */}
      <section className="w-[380px] shrink-0 border-r border-gray-100 flex flex-col">
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!e.target.value && query) {
                  setQuery("");
                  setPage(1);
                }
              }}
              placeholder={`Search ${currentFolder?.name || "mail"}`}
              className="pl-9 h-9"
            />
          </form>
          <button
            onClick={() => {
              loadMessages();
              loadFolders();
            }}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loadingList && "animate-spin")} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listError ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-600">{listError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => loadMessages()}>
                Try again
              </Button>
            </div>
          ) : loadingList && messages.length === 0 ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Inbox className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">{query ? `No emails match “${query}”` : "No emails here"}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {messages.map((m) => {
                const isSentFolder = currentFolder?.specialUse === "\\Sent" || currentFolder?.specialUse === "\\Drafts";
                const who = isSentFolder ? `To: ${m.to.map((a) => a.name || a.address).join(", ")}` : displayName(m.from);
                return (
                  <li key={m.uid}>
                    <button
                      onClick={() => openMessage(m.uid)}
                      className={cn(
                        "group w-full text-left px-4 py-3 transition-colors",
                        selectedUid === m.uid ? "bg-gray-50" : "hover:bg-gray-50/70"
                      )}
                      style={selectedUid === m.uid ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
                    >
                      <div className="flex items-center gap-2">
                        {!m.seen && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />}
                        <span className={cn("truncate text-sm", m.seen ? "text-gray-700" : "font-semibold text-gray-900")}>
                          {who || "(no sender)"}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-gray-400">{formatListDate(m.date)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={cn("truncate text-sm", m.seen ? "text-gray-500" : "text-gray-800")}>
                          {m.subject || "(no subject)"}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-gray-400">
                          {m.answered && <Reply className="h-3.5 w-3.5" />}
                          {m.hasAttachments && <Paperclip className="h-3.5 w-3.5" />}
                          {m.flagged && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        </span>
                      </div>
                      {m.client && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
                          <User className="h-3 w-3" />
                          {m.client.name}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
          <span>
            {total === 0 ? "0" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}`} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Reader */}
      <section className="flex-1 min-w-0 flex flex-col">
        {loadingMessage ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !message ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">Select an email to read it</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-gray-100 px-4 py-2">
              <ToolbarButton icon={Reply} label="Reply" onClick={() => startCompose("reply", message)} />
              <ToolbarButton icon={ReplyAll} label="Reply all" onClick={() => startCompose("replyAll", message)} />
              <ToolbarButton icon={Forward} label="Forward" onClick={() => startCompose("forward", message)} />
              <span className="mx-1 h-5 w-px bg-gray-200" />
              <ToolbarButton
                icon={Star}
                label={message.flagged ? "Unstar" : "Star"}
                iconClassName={message.flagged ? "fill-amber-400 text-amber-400" : undefined}
                onClick={() => setFlags(message.uid, { flagged: !message.flagged })}
              />
              <ToolbarButton icon={MailOpen} label="Mark unread" onClick={() => markUnread(message.uid)} />
              <ToolbarButton icon={Trash2} label="Delete" onClick={() => deleteMessage(message.uid)} />
              {moveTargets.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && moveMessage(message.uid, e.target.value)}
                  className="ml-auto h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-600"
                >
                  <option value="">Move to…</option>
                  {moveTargets.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-xl font-semibold tracking-tight text-gray-900">{message.subject || "(no subject)"}</h2>
              <div className="mt-4 flex items-start gap-3">
                <div
                  className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ backgroundColor: accent }}
                >
                  {(displayName(message.from) || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-gray-900">{message.from?.name || message.from?.address}</span>
                    {message.from?.name && <span className="text-gray-500">&lt;{message.from.address}&gt;</span>}
                    {message.client && (
                      <Link
                        href={`/clients/${message.client.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                        style={{ color: accent }}
                      >
                        <User className="h-3 w-3" />
                        Client: {message.client.name}
                      </Link>
                    )}
                    <span className="ml-auto text-xs text-gray-400">{formatFullDate(message.date)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">To: {formatAddrs(message.to) || "—"}</p>
                  {message.cc.length > 0 && <p className="truncate text-xs text-gray-500">Cc: {formatAddrs(message.cc)}</p>}
                </div>
              </div>
              {message.attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {message.attachments.map((a) => (
                    <button
                      key={a.index}
                      onClick={() => downloadAttachment(a.index, a.filename)}
                      className="inline-flex max-w-[260px] items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-left text-xs hover:bg-gray-100"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate font-medium text-gray-700">{a.filename}</span>
                      <span className="shrink-0 text-gray-400">{formatSize(a.size)}</span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <iframe
              key={`${message.folder}:${message.uid}`}
              title="Email content"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={frameDoc(message)}
              className="flex-1 w-full px-4 py-3 bg-white"
            />
          </>
        )}
      </section>

      {compose && account && (
        <ComposeDialog
          state={compose}
          account={account}
          accent={accent}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            loadFolders();
            if (currentFolder?.specialUse === "\\Sent") loadMessages({ quiet: true });
            if (compose.ref && compose.mode !== "forward") {
              setMessages((prev) => prev.map((m) => (m.uid === compose.ref!.uid ? { ...m, answered: true } : m)));
            }
          }}
        />
      )}

      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        accent={accent}
        onConnected={(a) => {
          setAccounts((prev) => [...(prev || []), a]);
          setAccountId(a.id);
        }}
      />

      {account && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          account={account}
          accent={accent}
          onSaved={(a) => setAccounts((prev) => (prev || []).map((x) => (x.id === a.id ? a : x)))}
          onRemoved={(id) => {
            setSettingsOpen(false);
            setAccounts((prev) => (prev || []).filter((x) => x.id !== id));
            setAccountId(null);
          }}
        />
      )}
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  iconClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  iconClassName?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
    >
      <Icon className={cn("h-4 w-4", iconClassName)} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

// ------------------------------------------------------------------ compose

function ComposeDialog({
  state,
  account,
  accent,
  onClose,
  onSent,
}: {
  state: ComposeState;
  account: MailAccount;
  accent: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState(state.to);
  const [cc, setCc] = useState(state.cc);
  const [bcc, setBcc] = useState(state.bcc);
  const [showCc, setShowCc] = useState(!!state.cc);
  const [subject, setSubject] = useState(state.subject);
  const [body, setBody] = useState(state.body);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ref = state.ref;

  const title = { new: "New email", reply: "Reply", replyAll: "Reply all", forward: "Forward" }[state.mode];

  const buildHtml = () => {
    let html = `<div>${textToHtml(body)}</div>`;
    if (account.signature) html += `<br><div>${textToHtml(account.signature)}</div>`;
    if (ref) {
      const original = ref.html || textToHtml(ref.text || "");
      if (state.mode === "forward") {
        html +=
          `<br><div>---------- Forwarded message ----------<br>` +
          `From: ${escapeHtml(formatAddrs(ref.from ? [ref.from] : []))}<br>` +
          `Date: ${escapeHtml(formatFullDate(ref.date))}<br>` +
          `Subject: ${escapeHtml(ref.subject)}<br>` +
          `To: ${escapeHtml(formatAddrs(ref.to))}</div><br>${original}`;
      } else {
        html +=
          `<br><div>On ${escapeHtml(formatFullDate(ref.date))}, ${escapeHtml(formatAddrs(ref.from ? [ref.from] : []))} wrote:</div>` +
          `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${original}</blockquote>`;
      }
    }
    return html;
  };

  const buildText = () => {
    let text = body;
    if (account.signature) text += `\n\n${account.signature}`;
    if (ref?.text) {
      text +=
        state.mode === "forward"
          ? `\n\n---------- Forwarded message ----------\nFrom: ${formatAddrs(ref.from ? [ref.from] : [])}\nSubject: ${ref.subject}\n\n${ref.text}`
          : `\n\nOn ${formatFullDate(ref.date)}, ${formatAddrs(ref.from ? [ref.from] : [])} wrote:\n${ref.text
              .split("\n")
              .map((l) => `> ${l}`)
              .join("\n")}`;
    }
    return text;
  };

  const send = async () => {
    if (!to.trim() && !cc.trim() && !bcc.trim()) {
      toast({ title: "Add a recipient", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("to", to);
      if (cc.trim()) form.append("cc", cc);
      if (bcc.trim()) form.append("bcc", bcc);
      form.append("subject", subject);
      form.append("html", buildHtml());
      form.append("text", buildText());
      if (ref) {
        form.append("mode", state.mode === "forward" ? "forward" : "reply");
        form.append("refFolder", ref.folder);
        form.append("refUid", String(ref.uid));
      }
      files.forEach((f) => form.append("attachments", f));
      const result = await api<{ savedToSent: boolean }>(`/mail/accounts/${account.id}/send`, { method: "POST", body: form });
      toast({
        title: "Email sent",
        description: result.savedToSent ? undefined : "Sent, but a copy couldn't be saved to the Sent folder.",
      });
      onSent();
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-gray-100">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">From {account.displayName ? `${account.displayName} <${account.email}>` : account.email}</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-gray-100">
          <FieldRow label="To">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, …" className="flex-1 bg-transparent text-sm outline-none" autoFocus={!to} />
            {!showCc && (
              <button onClick={() => setShowCc(true)} className="text-xs text-gray-500 hover:text-gray-800">
                Cc/Bcc
              </button>
            )}
          </FieldRow>
          {showCc && (
            <>
              <FieldRow label="Cc">
                <input value={cc} onChange={(e) => setCc(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
              </FieldRow>
              <FieldRow label="Bcc">
                <input value={bcc} onChange={(e) => setBcc(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
              </FieldRow>
            </>
          )}
          <FieldRow label="Subject">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
          </FieldRow>
        </div>
        <div className="px-5 py-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            autoFocus={!!to}
            placeholder="Write your message…"
            className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
          />
          {account.signature && <p className="whitespace-pre-wrap text-xs text-gray-400 border-t border-dashed border-gray-200 pt-2">{account.signature}</p>}
          {ref && (
            <p className="mt-3 text-xs text-gray-400">
              {state.mode === "forward"
                ? `The original email${ref.attachments.length ? ` and its ${ref.attachments.length} attachment${ref.attachments.length > 1 ? "s" : ""}` : ""} will be included below your message.`
                : `${displayName(ref.from)}'s original email will be quoted below your reply.`}
            </p>
          )}
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="inline-flex max-w-[240px] items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="truncate text-gray-700">{f.name}</span>
                  <span className="shrink-0 text-gray-400">{formatSize(f.size)}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t border-gray-100 flex-row items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                const tooBig = picked.find((f) => f.size > 15 * 1024 * 1024);
                if (tooBig) toast({ title: `${tooBig.name} is over 15 MB`, variant: "destructive" });
                setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= 15 * 1024 * 1024)].slice(0, 10));
                e.target.value = "";
              }}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={sending}>
              <Paperclip className="h-4 w-4 mr-1.5" />
              Attach
            </Button>
            {totalSize > 20 * 1024 * 1024 && <span className="text-xs text-amber-600">Large attachments may be rejected</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
              Discard
            </Button>
            <Button size="sm" className="text-white" style={{ backgroundColor: accent }} onClick={send} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <span className="w-14 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ connect

function ConnectDialog({
  open,
  onOpenChange,
  accent,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accent: string;
  onConnected: (a: MailAccount) => void;
}) {
  const { toast } = useToast();
  const blank = {
    email: "",
    password: "",
    displayName: "",
    imapHost: "imap.hostinger.com",
    imapPort: "993",
    smtpHost: "smtp.hostinger.com",
    smtpPort: "465",
  };
  const [form, setForm] = useState(blank);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(blank);
      setError(null);
      setAdvanced(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const imapPort = parseInt(form.imapPort) || 993;
      const smtpPort = parseInt(form.smtpPort) || 465;
      const account = await api<MailAccount>("/mail/accounts", {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          displayName: form.displayName.trim() || undefined,
          imapHost: form.imapHost.trim(),
          imapPort,
          imapSecure: imapPort === 993,
          smtpHost: form.smtpHost.trim(),
          smtpPort,
          smtpSecure: smtpPort === 465,
        }),
      });
      toast({ title: "Mailbox connected", description: account.email });
      onConnected(account);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a mailbox</DialogTitle>
          <DialogDescription>
            Use the email address and password you sign in to Hostinger Webmail with. Everyone with admin or manager access will see this mailbox.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mail-email">Email address</Label>
            <Input id="mail-email" type="email" required value={form.email} onChange={set("email")} placeholder="info@poolcare.africa" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-password">Password</Label>
            <Input id="mail-password" type="password" required value={form.password} onChange={set("password")} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-name">Sender name</Label>
            <Input id="mail-name" value={form.displayName} onChange={set("displayName")} placeholder="PoolCare" />
          </div>

          <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-xs font-medium text-gray-500 hover:text-gray-800">
            {advanced ? "Hide server settings" : "Server settings (not on Hostinger?)"}
          </button>
          {advanced && (
            <div className="grid grid-cols-[1fr_88px] gap-3 rounded-lg bg-gray-50 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="mail-imap-host" className="text-xs">Incoming (IMAP) server</Label>
                <Input id="mail-imap-host" value={form.imapHost} onChange={set("imapHost")} className="h-9 bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mail-imap-port" className="text-xs">Port</Label>
                <Input id="mail-imap-port" value={form.imapPort} onChange={set("imapPort")} className="h-9 bg-white" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mail-smtp-host" className="text-xs">Outgoing (SMTP) server</Label>
                <Input id="mail-smtp-host" value={form.smtpHost} onChange={set("smtpHost")} className="h-9 bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mail-smtp-port" className="text-xs">Port</Label>
                <Input id="mail-smtp-port" value={form.smtpPort} onChange={set("smtpPort")} className="h-9 bg-white" inputMode="numeric" />
              </div>
              <p className="col-span-2 text-[11px] text-gray-400">Ports 993 and 465 use SSL; 143 and 587 use STARTTLS.</p>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="text-white" style={{ backgroundColor: accent }} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {busy ? "Checking…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------- settings

function SettingsDialog({
  open,
  onOpenChange,
  account,
  accent,
  onSaved,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account: MailAccount;
  accent: string;
  onSaved: (a: MailAccount) => void;
  onRemoved: (id: string) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [displayName, setDisplayName] = useState("");
  const [signature, setSignature] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(account.displayName || "");
      setSignature(account.signature || "");
      setPassword("");
      setError(null);
    }
  }, [open, account]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<MailAccount>(`/mail/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName, signature, ...(password ? { password } : {}) }),
      });
      onSaved(updated);
      toast({ title: "Mailbox settings saved" });
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: `Disconnect ${account.email}?`,
        description: "The mailbox and its emails stay on the mail server; it just won't show in PoolCare any more.",
        destructive: true,
        confirmLabel: "Disconnect",
      }))
    )
      return;
    try {
      await api(`/mail/accounts/${account.id}`, { method: "DELETE" });
      toast({ title: "Mailbox disconnected" });
      onRemoved(account.id);
    } catch (e: any) {
      toast({ title: "Couldn't disconnect", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mailbox settings</DialogTitle>
          <DialogDescription>
            {account.email} · {account.imapHost}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mail-set-name">Sender name</Label>
            <Input id="mail-set-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="PoolCare" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-set-sig">Signature</Label>
            <Textarea id="mail-set-sig" rows={4} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={"Kind regards,\nPoolCare Team\n+233 …"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-set-pass">New password</Label>
            <Input id="mail-set-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Only if you changed it in Hostinger" autoComplete="new-password" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={remove} disabled={busy}>
            Disconnect
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button className="text-white" style={{ backgroundColor: accent }} onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
