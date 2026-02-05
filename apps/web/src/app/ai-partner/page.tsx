"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/theme-context";
import { Sparkles, Send, Loader2, User, Bot, MessageSquarePlus, Trash2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function getAuthHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function AiPartnerPage() {
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();
  const [chatList, setChatList] = useState<ChatSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchChatList = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/ai/business-partner/chats`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setChatList(data.chats || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchChatList();
  }, [fetchChatList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startNewChat = () => {
    setConversationId(null);
    setCurrentTitle(null);
    setMessages([]);
    setError(null);
  };

  const loadChat = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/ai/business-partner/chats/${id}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load conversation");
      const data = await res.json();
      setConversationId(data.id);
      setCurrentTitle(data.title);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      const res = await fetch(`${API_URL}/ai/business-partner/chats/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        if (conversationId === id) startNewChat();
        setChatList((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      // ignore
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const history = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));
      const body: { messages: typeof history; conversationId?: string } = { messages: history };
      if (conversationId) body.conversationId = conversationId;

      const res = await fetch(`${API_URL}/ai/business-partner/chat`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to get response");
      }
      const assistantContent = data.message ?? "";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
      if (data.conversationId) {
        setConversationId(data.conversationId);
        if (data.title) setCurrentTitle(data.title);
        if (!conversationId) {
          setChatList((prev) => [
            { id: data.conversationId, title: data.title || "New chat", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            ...prev,
          ]);
        } else {
          setChatList((prev) =>
            prev.map((c) =>
              c.id === data.conversationId ? { ...c, title: data.title || c.title, updatedAt: new Date().toISOString() } : c
            )
          );
        }
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong. Check Settings → API LLM is configured.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="p-6 flex gap-6 max-w-6xl mx-auto">
      {/* History sidebar */}
      <Card className="w-56 flex-shrink-0 hidden sm:block">
        <CardHeader className="py-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={startNewChat}
          >
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">History</p>
          {loadingHistory ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : chatList.length === 0 ? (
            <p className="text-sm text-gray-400">No conversations yet</p>
          ) : (
            <ul className="space-y-1">
              {chatList.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => loadChat(chat.id)}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-sm flex items-center gap-2 group ${
                      conversationId === chat.id ? "bg-gray-100 font-medium" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex-1 truncate">{chat.title}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(chat.updatedAt)}</span>
                    <button
                      type="button"
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-red-600 flex-shrink-0"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Main chat */}
      <Card className="flex-1 min-w-0">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${themeColorHex}20` }}
              >
                <Sparkles className="h-5 w-5" style={{ color: themeColorHex }} />
              </div>
              {currentTitle || "AI Business Partner"}
            </CardTitle>
            <Button variant="ghost" size="sm" className="sm:hidden gap-1" onClick={startNewChat}>
              <MessageSquarePlus className="h-4 w-4" /> New
            </Button>
          </div>
          <CardDescription>
            Your strategic advisor. Ask anything about your business—operations, revenue, priorities, or next steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-h-[360px] max-h-[55vh] overflow-y-auto rounded-lg border bg-gray-50/50 p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <p className="font-medium">Start a conversation</p>
                <p className="text-sm mt-1">e.g. &quot;What should I focus on today?&quot; or &quot;How&apos;s our pipeline looking?&quot;</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${themeColorHex}25` }}
                  >
                    <Bot className="h-4 w-4" style={{ color: themeColorHex }} />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                    m.role === "user" ? "text-white" : "bg-white border shadow-sm"
                  }`}
                  style={m.role === "user" ? { backgroundColor: themeColorHex } : undefined}
                >
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                </div>
                {m.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-4 w-4 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${themeColorHex}25` }}
                >
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: themeColorHex }} />
                </div>
                <div className="rounded-lg px-4 py-2.5 bg-white border shadow-sm text-gray-500 text-sm">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask about your business..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="resize-none"
              disabled={loading}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="self-end"
              style={{ backgroundColor: themeColorHex }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
