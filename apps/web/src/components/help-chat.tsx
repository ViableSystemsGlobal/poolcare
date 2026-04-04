"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, X, Send, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { useTheme } from "@/contexts/theme-context";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_QUESTIONS = [
  "How do I create a job?",
  "How do I send an invoice?",
  "How do I add a new client?",
];

export function HelpChat() {
  const { getThemeColor } = useTheme();
  const themeColor = getThemeColor();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [assistantName, setAssistantName] = useState("PoolCare Help");
  const [assistantImageUrl, setAssistantImageUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch branding settings for assistant name/image
  useEffect(() => {
    async function fetchSettings() {
      try {
        const data = await api.getOrgSettings() as any;
        if (data?.profile?.helpAssistantName) {
          setAssistantName(data.profile.helpAssistantName);
        }
        if (data?.profile?.helpAssistantImageUrl) {
          setAssistantImageUrl(data.profile.helpAssistantImageUrl);
        }
      } catch {
        // ignore - use defaults
      }
    }
    fetchSettings();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const result = await api.chatWithHelpAssistant(
        newMessages.map((m) => ({ role: m.role, content: m.content }))
      );
      setMessages([...newMessages, { role: "assistant", content: result.message }]);
    } catch (err: any) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: err.message || "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: themeColor }}
          title="Help"
        >
          {assistantImageUrl ? (
            <img
              src={assistantImageUrl}
              alt={assistantName}
              className="w-14 h-14 rounded-full object-cover"
            />
          ) : (
            <MessageCircleQuestion className="h-6 w-6 text-white" />
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ backgroundColor: themeColor }}
          >
            <div className="flex items-center gap-3">
              {assistantImageUrl ? (
                <img
                  src={assistantImageUrl}
                  alt={assistantName}
                  className="w-8 h-8 rounded-full object-cover border-2 border-white/30"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageCircleQuestion className="h-4 w-4 text-white" />
                </div>
              )}
              <span className="text-white font-semibold text-sm">{assistantName}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 text-center mt-4">
                  Hi! I can help you navigate the PoolCare admin system. Ask me anything, or try one of these:
                </p>
                <div className="space-y-2">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-gray-700"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                  style={
                    msg.role === "user" ? { backgroundColor: themeColor } : undefined
                  }
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-gray-200 px-3 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                disabled={loading}
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-gray-400 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="p-2 rounded-lg text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: themeColor }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
