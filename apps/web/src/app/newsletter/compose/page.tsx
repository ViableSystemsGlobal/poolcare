"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTheme } from "@/contexts/theme-context";
import {
  ArrowLeft,
  Loader2,
  Send,
  RefreshCw,
  Eye,
  Code,
  CheckCircle,
  AlertCircle,
  Clock,
  ThumbsUp,
  Mail,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api-client";

type Tone = "professional" | "friendly" | "casual";
type RecipientType = "all" | "active" | "custom";

interface DraftItem {
  id: string;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string;
  metadata?: { includedTips?: string[] };
}

export default function ComposeNewsletterPage() {
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();

  // Generate state
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Preview/Edit state
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [recipientType, setRecipientType] = useState<RecipientType>("all");
  const [customEmails, setCustomEmails] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Drafts state
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    try {
      const data = (await api.getNewsletterDrafts()) as any;
      const items = data?.items || (Array.isArray(data) ? data : []);
      setDrafts(items);
    } catch {
      // ignore
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setSendSuccess(false);
    try {
      const data = (await api.generateNewsletter(
        topic || undefined,
        tone
      )) as any;
      setSubject(data.subject || "");
      setHtmlBody(data.htmlBody || data.body || "");
      setHasGenerated(true);
      setShowPreview(true);
    } catch (e: any) {
      setGenerateError(
        e.message || "Failed to generate newsletter. Check AI settings."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    try {
      await api.sendNewsletter(
        subject,
        htmlBody,
        recipientType,
        recipientType === "custom" ? customEmails : undefined
      );
      setSendSuccess(true);
    } catch (e: any) {
      setSendError(e.message || "Failed to send newsletter.");
    } finally {
      setSending(false);
    }
  };

  const handleSendTestEmail = async () => {
    setSendingTest(true);
    try {
      if (!subject.trim() || !htmlBody.trim()) {
        setGenerateError(
          "Generate a newsletter first before sending a test email."
        );
        setSendingTest(false);
        return;
      }
      await api.sendNewsletter(subject, htmlBody, "custom", "test@example.com");
    } catch {
      // ignore
    } finally {
      setSendingTest(false);
    }
  };

  const handleApproveDraft = async (id: string) => {
    setApprovingId(id);
    try {
      await api.approveNewsletterDraft(id);
      fetchDrafts();
    } catch {
      // ignore
    } finally {
      setApprovingId(null);
    }
  };

  const handleSendDraft = async (id: string) => {
    setSendingDraftId(id);
    try {
      await api.sendNewsletterDraft(id, "all");
      fetchDrafts();
    } catch {
      // ignore
    } finally {
      setSendingDraftId(null);
    }
  };

  const recipientLabel = (type: string) => {
    switch (type) {
      case "all":
        return "All Clients";
      case "active":
        return "Active Clients";
      case "custom":
        return "Custom Emails";
      default:
        return type;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/newsletter")}
          className="flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Compose Newsletter
          </h1>
          <p className="text-sm text-gray-500">
            Generate, preview, and send an AI-powered newsletter
          </p>
        </div>
      </div>

      {/* Pending Drafts Banner */}
      {!loadingDrafts && drafts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base">
                You have {drafts.length} draft{drafts.length > 1 ? "s" : ""}{" "}
                ready
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {drafts.map((draft) => {
              const isApproved = draft.status === "approved";
              return (
                <div
                  key={draft.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-white"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {draft.subject || "Untitled Draft"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Generated{" "}
                      {new Date(draft.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {isApproved && (
                        <span className="ml-2 text-green-600 font-medium">
                          Approved
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {!isApproved && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApproveDraft(draft.id)}
                        disabled={approvingId === draft.id}
                        className="h-8"
                      >
                        {approvingId === draft.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <ThumbsUp className="h-3 w-3 mr-1" />
                        )}
                        Approve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleSendDraft(draft.id)}
                      disabled={
                        sendingDraftId === draft.id ||
                        (!isApproved && approvingId !== draft.id)
                      }
                      style={
                        isApproved ? { backgroundColor: themeColorHex } : {}
                      }
                      className={`h-8 ${isApproved ? "text-white" : ""}`}
                    >
                      {sendingDraftId === draft.id ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Send className="h-3 w-3 mr-1" />
                      )}
                      Send
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Generate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: themeColorHex }} />
            Step 1 — Generate
          </CardTitle>
          <CardDescription>
            Provide an optional topic and tone to generate a newsletter with AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic (optional)</Label>
            <Input
              id="topic"
              placeholder="e.g. Summer pool maintenance tips, winter closing checklist..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={generating}
              className="text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tone">Tone</Label>
            <Select
              value={tone}
              onValueChange={(v) => setTone(v as Tone)}
              disabled={generating}
            >
              <SelectTrigger id="tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            style={{ backgroundColor: themeColorHex }}
            className="text-white w-full h-11 text-base"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating newsletter...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Newsletter
              </>
            )}
          </Button>

          {generateError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {generateError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Preview & Edit */}
      {hasGenerated && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" style={{ color: themeColorHex }} />
                Step 2 — Preview & Edit
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="gap-1.5 h-8"
                >
                  {showPreview ? (
                    <>
                      <Code className="h-3.5 w-3.5" /> Edit HTML
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="gap-1.5 h-8"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`}
                  />
                  Regenerate
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Newsletter subject..."
                className="text-base"
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label>
                Body{" "}
                <span className="text-gray-400 font-normal text-xs">
                  ({showPreview ? "Preview" : "HTML Editor"})
                </span>
              </Label>
              {showPreview ? (
                <div className="rounded-lg border bg-white overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-500">
                        Subject:
                      </span>
                      <span className="text-gray-900">
                        {subject || "No subject"}
                      </span>
                    </div>
                  </div>
                  <div
                    className="p-6 min-h-[300px] max-h-[500px] overflow-y-auto prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: htmlBody }}
                  />
                </div>
              ) : (
                <Textarea
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                  placeholder="<html>...</html>"
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Send */}
      {hasGenerated && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5" style={{ color: themeColorHex }} />
              Step 3 — Send
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Recipient Selection */}
            <div className="space-y-1.5">
              <Label htmlFor="recipients">Recipients</Label>
              <Select
                value={recipientType}
                onValueChange={(v) => setRecipientType(v as RecipientType)}
              >
                <SelectTrigger id="recipients">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="active">Active Clients</SelectItem>
                  <SelectItem value="custom">Custom Emails</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipientType === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="customEmails">
                  Email Addresses{" "}
                  <span className="text-gray-400 font-normal">
                    (comma-separated)
                  </span>
                </Label>
                <Textarea
                  id="customEmails"
                  value={customEmails}
                  onChange={(e) => setCustomEmails(e.target.value)}
                  rows={2}
                  placeholder="john@example.com, jane@example.com"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleSendTestEmail}
                disabled={sendingTest || !subject.trim() || !htmlBody.trim()}
                className="gap-2"
              >
                {sendingTest ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send Test to Me
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={sending || !subject.trim() || !htmlBody.trim()}
                style={{ backgroundColor: themeColorHex }}
                className="text-white gap-2 flex-1"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Newsletter
                  </>
                )}
              </Button>
            </div>

            {sendSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                <CheckCircle className="h-4 w-4" />
                Newsletter sent successfully!
              </div>
            )}
            {sendError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                {sendError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Newsletter?</DialogTitle>
            <DialogDescription>
              This will send &quot;{subject}&quot; to{" "}
              <strong>{recipientLabel(recipientType)}</strong>.
              {recipientType === "custom" && (
                <>
                  {" "}
                  ({customEmails.split(",").filter((e) => e.trim()).length}{" "}
                  email(s))
                </>
              )}{" "}
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              style={{ backgroundColor: themeColorHex }}
              className="text-white"
            >
              Confirm & Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
