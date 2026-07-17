"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  ArrowRight,
  Loader2,
  Send,
  RefreshCw,
  Eye,
  Code,
  Check,
  CheckCircle,
  AlertCircle,
  ThumbsUp,
  Mail,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api-client";

type Tone = "professional" | "friendly" | "casual";
type RecipientType = "all" | "active" | "custom";
type Step = 1 | 2 | 3;

interface DraftItem {
  id: string;
  subject: string | null;
  textBody: string;
  htmlBody: string;
  status: string;
  createdAt: string;
  weekRange?: string | null;
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Generate" },
  { n: 2, label: "Review" },
  { n: 3, label: "Send" },
];

export default function ComposeNewsletterPage() {
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();

  // Wizard state
  const [step, setStep] = useState<Step>(1);

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

  const canVisit = (n: Step) => n === 1 || (hasGenerated && !sendSuccess);

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
      setStep(2);
    } catch (e: any) {
      setGenerateError(
        e.message || "Failed to generate newsletter. Check AI settings."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenDraft = (draft: DraftItem) => {
    setSubject(draft.subject || "");
    setHtmlBody(draft.htmlBody || draft.textBody || "");
    setHasGenerated(true);
    setShowPreview(true);
    setSendSuccess(false);
    setGenerateError(null);
    setStep(2);
  };

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setSendError(null);
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

  const resetWizard = () => {
    setStep(1);
    setTopic("");
    setSubject("");
    setHtmlBody("");
    setHasGenerated(false);
    setSendSuccess(false);
    setSendError(null);
    setGenerateError(null);
    setRecipientType("all");
    setCustomEmails("");
    fetchDrafts();
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
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
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
            Generate, review, and send an AI-powered newsletter
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stepper                                                             */}
      {/* ------------------------------------------------------------------ */}
      {!sendSuccess && (
        <div className="bg-white rounded-xl shadow-sm px-6 py-4">
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const isActive = step === s.n;
              const isDone = step > s.n;
              const clickable = canVisit(s.n) && s.n < step;
              return (
                <div key={s.n} className="flex items-center flex-1 last:flex-none">
                  <button
                    type="button"
                    disabled={!clickable && !isActive}
                    onClick={() => clickable && setStep(s.n)}
                    className={`flex items-center gap-2.5 ${clickable ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span
                      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors"
                      style={
                        isActive || isDone
                          ? { backgroundColor: themeColorHex, color: "#fff" }
                          : { backgroundColor: "#f3f4f6", color: "#9ca3af" }
                      }
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : s.n}
                    </span>
                    <span
                      className={`text-[11px] font-medium uppercase tracking-wider ${
                        isActive ? "text-gray-900" : isDone ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-px bg-gray-200 mx-4" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Sent — success state                                                */}
      {/* ------------------------------------------------------------------ */}
      {sendSuccess && (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center">
          <CheckCircle className="h-10 w-10 mx-auto mb-4" style={{ color: themeColorHex }} />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Newsletter sent
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            &quot;{subject}&quot; is on its way to {recipientLabel(recipientType).toLowerCase()}.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => router.push("/newsletter/history")}>
              View History
            </Button>
            <Button
              onClick={resetWizard}
              style={{ backgroundColor: themeColorHex }}
              className="text-white"
            >
              Compose Another
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Generate (or open a pending draft)                         */}
      {/* ------------------------------------------------------------------ */}
      {!sendSuccess && step === 1 && (
        <>
          {!loadingDrafts && drafts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                Pending Drafts ({drafts.length})
              </h2>
              <div className="divide-y divide-gray-50">
                {drafts.map((draft) => {
                  const isApproved = draft.status === "approved";
                  return (
                    <div
                      key={draft.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenDraft(draft)}
                        className="min-w-0 flex-1 text-left group"
                        title="Open this draft in Review"
                      >
                        <p className="font-medium text-sm text-gray-900 truncate group-hover:underline">
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
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDraft(draft)}
                          className="h-8"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Open
                        </Button>
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
                          disabled={sendingDraftId === draft.id || !isApproved}
                          style={isApproved ? { backgroundColor: themeColorHex } : {}}
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
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">
              Generate with AI
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              Provide an optional topic and tone — or open a pending draft above
            </p>
            <div className="space-y-4">
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
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{ backgroundColor: themeColorHex }}
                  className="text-white flex-1 h-11 text-base"
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
                {hasGenerated && (
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    className="h-11"
                  >
                    Resume Draft
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>

              {generateError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {generateError}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2 — Review & Edit                                              */}
      {/* ------------------------------------------------------------------ */}
      {!sendSuccess && step === 2 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Review &amp; Edit
            </h2>
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

          <div className="space-y-4">
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

            {generateError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {generateError}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!subject.trim() || !htmlBody.trim()}
                style={{ backgroundColor: themeColorHex }}
                className="text-white"
              >
                Continue to Send
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — Send                                                       */}
      {/* ------------------------------------------------------------------ */}
      {!sendSuccess && step === 3 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">
            Send
          </h2>
          <p className="text-xs text-gray-400 mb-5 truncate">
            &quot;{subject}&quot;
          </p>

          <div className="space-y-4">
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

            {sendError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {sendError}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-3">
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
                  className="text-white gap-2"
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
            </div>
          </div>
        </div>
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
              Confirm &amp; Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
