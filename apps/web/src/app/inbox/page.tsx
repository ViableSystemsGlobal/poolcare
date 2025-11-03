"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Inbox,
  Archive,
  Search,
  Send,
  Paperclip,
  Sparkles,
  Clock,
  User,
  Link as LinkIcon,
  MoreVertical,
  ChevronRight,
  Droplet,
  Receipt,
  FileText,
  Calendar,
  ExternalLink,
  Plus,
} from "lucide-react";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

interface Message {
  id: string;
  text?: string;
  senderRole: string;
  channel: string;
  createdAt: string;
  attachments?: any;
}

interface ThreadLink {
  id: string;
  targetType: string;
  targetId: string;
}

interface Thread {
  id: string;
  subject?: string;
  status: string;
  channelPrimary: string;
  unreadCount: number;
  lastMessageAt?: string;
  client?: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  messages?: Message[];
  links?: ThreadLink[];
  _count?: {
    messages: number;
  };
}

export default function InboxPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkType, setLinkType] = useState<string>("");
  const [linkId, setLinkId] = useState<string>("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    fetchThreads();
  }, [selectedFolder]);

  useEffect(() => {
    if (selectedThread) {
      fetchThreadDetails(selectedThread.id);
      // Poll for new messages every 5 seconds
      const interval = setInterval(() => {
        fetchThreadDetails(selectedThread.id);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedThread?.id]);

  useEffect(() => {
    if (selectedThread?.client?.id) {
      fetchClientDetails(selectedThread.client.id);
    } else {
      setClientDetails(null);
    }
  }, [selectedThread?.client?.id]);

  const fetchThreads = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (selectedFolder === "inbox") {
        params.append("status", "open");
      } else if (selectedFolder === "archived") {
        params.append("status", "archived");
      } else if (selectedFolder === "unread") {
        params.append("status", "open");
        params.append("tag", "UNREAD");
      }

      const response = await fetch(`${API_URL}/threads?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setThreads(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch threads:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchThreadDetails = async (threadId: string) => {
    try {
      const response = await fetch(`${API_URL}/threads/${threadId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const thread = await response.json();
        setSelectedThread(thread);
        // Also update in threads list
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? thread : t))
        );
      }
    } catch (error) {
      console.error("Failed to fetch thread details:", error);
    }
  };

  const fetchClientDetails = async (clientId: string) => {
    try {
      const response = await fetch(`${API_URL}/clients/${clientId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const client = await response.json();
        setClientDetails(client);

        // Fetch recent invoices and quotes
        const [invoicesRes, quotesRes] = await Promise.all([
          fetch(`${API_URL}/invoices?clientId=${clientId}&limit=5`, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          }),
          fetch(`${API_URL}/quotes?clientId=${clientId}&limit=5`, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            },
          }),
        ]);

        if (invoicesRes.ok) {
          const invoicesData = await invoicesRes.json();
          setClientDetails((prev: any) => ({
            ...prev,
            recentInvoices: invoicesData.items || [],
          }));
        }

        if (quotesRes.ok) {
          const quotesData = await quotesRes.json();
          setClientDetails((prev: any) => ({
            ...prev,
            recentQuotes: quotesData.items || [],
          }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch client details:", error);
    }
  };

  const handleLinkThread = async () => {
    if (!linkType || !linkId || !selectedThread) return;

    try {
      const response = await fetch(`${API_URL}/threads/${selectedThread.id}/links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          targetType: linkType,
          targetId: linkId,
        }),
      });

      if (response.ok) {
        setShowLinkDialog(false);
        setLinkType("");
        setLinkId("");
        await fetchThreadDetails(selectedThread.id);
      } else {
        const error = await response.json();
        alert(`Failed to link thread: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to link thread:", error);
      alert("Failed to link thread");
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedThread) return;

    try {
      const response = await fetch(`${API_URL}/threads/${selectedThread.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          text: messageText,
          channel: "inapp",
          senderRole: "manager",
        }),
      });

      if (response.ok) {
        setMessageText("");
        setShowSuggestions(false);
        await fetchThreadDetails(selectedThread.id);
        await fetchThreads();
      } else {
        const error = await response.json();
        alert(`Failed to send message: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message");
    }
  };

  const handleGetSuggestions = async () => {
    if (!selectedThread) return;

    try {
      const response = await fetch(`${API_URL}/threads/${selectedThread.id}/suggest-replies`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error("Failed to get suggestions:", error);
    }
  };

  const handleUseSuggestion = (text: string) => {
    setMessageText(text);
    setShowSuggestions(false);
  };

  const handleArchiveThread = async (threadId: string) => {
    if (!confirm("Archive this thread?")) return;

    try {
      const response = await fetch(`${API_URL}/threads/${threadId}/archive`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        if (selectedThread?.id === threadId) {
          setSelectedThread(null);
        }
        await fetchThreads();
      }
    } catch (error) {
      console.error("Failed to archive thread:", error);
    }
  };

  const filteredThreads = threads.filter((thread) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      thread.client?.name?.toLowerCase().includes(query) ||
      thread.subject?.toLowerCase().includes(query) ||
      thread.client?.email?.toLowerCase().includes(query) ||
      thread.client?.phone?.toLowerCase().includes(query)
    );
  });

  const unreadCount = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <div className="flex h-[calc(100vh-120px)] bg-gray-50">
      {/* Left Sidebar - Folders */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
          <p className="text-sm text-gray-500">{threads.length} threads</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={() => setSelectedFolder("inbox")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1",
              selectedFolder === "inbox"
                ? `${getThemeClasses().primary === "orange" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"}`
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <Inbox className="h-5 w-5" />
            <span>Inbox</span>
            {unreadCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setSelectedFolder("unread")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1",
              selectedFolder === "unread"
                ? `${getThemeClasses().primary === "orange" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"}`
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <MessageSquare className="h-5 w-5" />
            <span>Unread</span>
          </button>

          <button
            onClick={() => setSelectedFolder("archived")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1",
              selectedFolder === "archived"
                ? `${getThemeClasses().primary === "orange" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"}`
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <Archive className="h-5 w-5" />
            <span>Archived</span>
          </button>
        </div>
      </div>

      {/* Middle - Thread List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search threads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading threads...</div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No threads found</div>
          ) : (
            filteredThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={cn(
                  "w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors",
                  selectedThread?.id === thread.id && "bg-blue-50 border-l-4 border-blue-500"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900 truncate">
                        {thread.client?.name || "Unknown Client"}
                      </p>
                      {thread.unreadCount > 0 && (
                        <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                    {thread.subject && (
                      <p className="text-sm text-gray-600 truncate">{thread.subject}</p>
                    )}
                    {thread.messages && thread.messages.length > 0 && (
                      <p className="text-sm text-gray-500 truncate mt-1">
                        {thread.messages[thread.messages.length - 1].text?.substring(0, 60) || "Media"}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-2" />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="capitalize">{thread.channelPrimary}</span>
                  {thread.lastMessageAt && (
                    <>
                      <span>•</span>
                      <span>{new Date(thread.lastMessageAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right - Conversation */}
      <div className="flex-1 bg-white flex flex-col">
        {selectedThread ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Main Conversation Area */}
            <div className="flex-1 flex flex-col border-r border-gray-200">
              {/* Thread Header */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">
                    {selectedThread.client?.name || "Unknown Client"}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    {selectedThread.client?.email && (
                      <>
                        <span>{selectedThread.client.email}</span>
                        <span>•</span>
                      </>
                    )}
                    {selectedThread.client?.phone && <span>{selectedThread.client.phone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLinkDialog(true)}
                    title="Link to invoice/quote/job"
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleArchiveThread(selectedThread.id)}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </Button>
                  {selectedThread.links && selectedThread.links.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <LinkIcon className="h-4 w-4" />
                      <span>{selectedThread.links.length}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedThread.messages && selectedThread.messages.length > 0 ? (
                  selectedThread.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.senderRole === "manager" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg px-4 py-2",
                          message.senderRole === "manager"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-900"
                        )}
                      >
                        <p className="text-sm">{message.text}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    No messages yet. Start the conversation!
                  </div>
                )}
              </div>

              {/* AI Suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="border-t border-gray-200 p-3 bg-blue-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">AI Suggestions</span>
                  </div>
                  <div className="space-y-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        onClick={() => handleUseSuggestion(suggestion.text)}
                        className="w-full text-left p-2 bg-white rounded border border-blue-200 hover:border-blue-400 transition-colors"
                      >
                        <p className="text-sm text-gray-900">{suggestion.text}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {suggestion.intent} • {Math.round(suggestion.confidence * 100)}% confidence
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Composer */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGetSuggestions}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Reply
                  </Button>
                  <Button variant="outline" size="sm">
                    <Paperclip className="h-4 w-4 mr-2" />
                    Attach
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 min-h-[80px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button onClick={handleSendMessage} disabled={!messageText.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Client Context Sidebar */}
            {clientDetails && (
              <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-4">Client Context</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{clientDetails.name}</p>
                      {clientDetails.email && (
                        <p className="text-xs text-gray-600">{clientDetails.email}</p>
                      )}
                      {clientDetails.phone && (
                        <p className="text-xs text-gray-600">{clientDetails.phone}</p>
                      )}
                    </div>
                    {clientDetails._count && (
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Pools</p>
                          <p className="font-semibold text-gray-900">{clientDetails._count.pools}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Invoices</p>
                          <p className="font-semibold text-gray-900">{clientDetails._count.invoices}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Quotes</p>
                          <p className="font-semibold text-gray-900">{clientDetails._count.quotes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pools */}
                {clientDetails.pools && clientDetails.pools.length > 0 && (
                  <div className="p-4 border-b border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Pools</h4>
                    <div className="space-y-2">
                      {clientDetails.pools.slice(0, 3).map((pool: any) => (
                        <button
                          key={pool.id}
                          onClick={() => router.push(`/pools/${pool.id}`)}
                          className="w-full text-left p-2 bg-white rounded border border-gray-200 hover:border-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Droplet className="h-4 w-4 text-blue-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {pool.name || "Unnamed Pool"}
                              </p>
                              {pool.address && (
                                <p className="text-xs text-gray-500 truncate">{pool.address}</p>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          </div>
                        </button>
                      ))}
                      {clientDetails.pools.length > 3 && (
                        <button
                          onClick={() => router.push(`/clients/${clientDetails.id}`)}
                          className="w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2"
                        >
                          View all {clientDetails.pools.length} pools
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Invoices */}
                {clientDetails.recentInvoices && clientDetails.recentInvoices.length > 0 && (
                  <div className="p-4 border-b border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Invoices</h4>
                    <div className="space-y-2">
                      {clientDetails.recentInvoices.map((invoice: any) => (
                        <button
                          key={invoice.id}
                          onClick={() => router.push(`/invoices/${invoice.id}`)}
                          className="w-full text-left p-2 bg-white rounded border border-gray-200 hover:border-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-green-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {invoice.invoiceNumber}
                              </p>
                              <p className="text-xs text-gray-500">
                                {(invoice.totalCents / 100).toFixed(2)} {invoice.currency}
                              </p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Quotes */}
                {clientDetails.recentQuotes && clientDetails.recentQuotes.length > 0 && (
                  <div className="p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Quotes</h4>
                    <div className="space-y-2">
                      {clientDetails.recentQuotes.map((quote: any) => (
                        <button
                          key={quote.id}
                          onClick={() => router.push(`/quotes/${quote.id}`)}
                          className="w-full text-left p-2 bg-white rounded border border-gray-200 hover:border-blue-400 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-purple-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                Quote #{quote.id.slice(0, 8)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {(quote.totalCents / 100).toFixed(2)} {quote.currency}
                              </p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="p-4 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => router.push(`/clients/${clientDetails.id}`)}
                    >
                      <User className="h-4 w-4 mr-2" />
                      View Client
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => router.push(`/invoices?clientId=${clientDetails.id}`)}
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      View Invoices
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 w-full">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>Select a thread to view messages</p>
            </div>
          </div>
        )}
      </div>

      {/* Link Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Link Thread</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Link Type
                  </label>
                  <select
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">Select type...</option>
                    <option value="invoice">Invoice</option>
                    <option value="quote">Quote</option>
                    <option value="job">Job</option>
                    <option value="pool">Pool</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    {linkType ? `${linkType.charAt(0).toUpperCase() + linkType.slice(1)} ID` : "ID"}
                  </label>
                  <Input
                    value={linkId}
                    onChange={(e) => setLinkId(e.target.value)}
                    placeholder="Enter ID..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleLinkThread} disabled={!linkType || !linkId}>
                    Link
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
