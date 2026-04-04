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
import { useTheme } from "@/contexts/theme-context";
import {
  ArrowLeft,
  Loader2,
  Send,
  CheckCircle,
  Lightbulb,
  ThumbsUp,
  Pencil,
  Clock,
  MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api-client";

interface WeeklyTipItem {
  day: string;
  dayName: string;
  date: string;
  tipIndex: number;
  tip: string;
  approved: boolean;
}

export default function TipsPage() {
  const router = useRouter();
  const { getThemeColor } = useTheme();
  const themeColorHex = getThemeColor();

  // Weekly tips state
  const [weeklyTips, setWeeklyTips] = useState<WeeklyTipItem[]>([]);
  const [loadingTips, setLoadingTips] = useState(true);
  const [approvingTips, setApprovingTips] = useState(false);
  const [editingTipIndex, setEditingTipIndex] = useState<number | null>(null);
  const [editingTipText, setEditingTipText] = useState("");
  const [savingTipIndex, setSavingTipIndex] = useState<number | null>(null);
  const [preparingWeekly, setPreparingWeekly] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  // Manual tip state
  const [manualTip, setManualTip] = useState("");
  const [sendingManualTip, setSendingManualTip] = useState(false);
  const [manualTipSuccess, setManualTipSuccess] = useState<string | null>(null);
  const [tipTestPhone, setTipTestPhone] = useState("");
  const [tipSendMode, setTipSendMode] = useState<"test" | "all">("test");

  const fetchWeeklyTips = useCallback(async () => {
    try {
      const data = (await api.getWeeklyTipsQueue()) as any;
      const items: WeeklyTipItem[] =
        data?.items || (Array.isArray(data) ? data : []);
      setWeeklyTips(items);
    } catch {
      // ignore
    } finally {
      setLoadingTips(false);
    }
  }, []);

  useEffect(() => {
    fetchWeeklyTips();
  }, [fetchWeeklyTips]);

  const handlePrepareWeekly = async () => {
    setPreparingWeekly(true);
    setPrepareError(null);
    try {
      await api.prepareWeeklyContent();
      await fetchWeeklyTips();
    } catch (e: any) {
      setPrepareError(e.message || "Failed to prepare weekly content");
    } finally {
      setPreparingWeekly(false);
    }
  };

  const handleApproveAllTips = async () => {
    setApprovingTips(true);
    try {
      await api.approveWeeklyTips();
      fetchWeeklyTips();
    } catch {
      // ignore
    } finally {
      setApprovingTips(false);
    }
  };

  const handleSaveTip = async (index: number) => {
    setSavingTipIndex(index);
    try {
      await api.updateWeeklyTip(index, editingTipText);
      setEditingTipIndex(null);
      setEditingTipText("");
      fetchWeeklyTips();
    } catch {
      // ignore
    } finally {
      setSavingTipIndex(null);
    }
  };

  const handleSendManualTip = async () => {
    if (!manualTip.trim()) return;
    setSendingManualTip(true);
    setManualTipSuccess(null);
    try {
      const phone =
        tipSendMode === "test" && tipTestPhone.trim()
          ? tipTestPhone.trim()
          : undefined;
      await api.sendTip(manualTip.trim(), phone);
      setManualTipSuccess(
        phone ? `Sent to ${phone}` : "Sent to all clients!"
      );
      setManualTip("");
      setTimeout(() => setManualTipSuccess(null), 3000);
    } catch {
      // ignore
    } finally {
      setSendingManualTip(false);
    }
  };

  // Computed stats
  const tipsThisWeek = weeklyTips.length;
  const tipsApproved = weeklyTips.filter((t) => t.approved).length;
  const allApproved = weeklyTips.length > 0 && weeklyTips.every((t) => t.approved);

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
          <h1 className="text-2xl font-bold text-gray-900">Tips of the Day</h1>
          <p className="text-sm text-gray-500">
            Manage weekly tips queue and send custom tips
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Tips This Week
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {loadingTips ? (
                    <span className="text-gray-300">--</span>
                  ) : (
                    tipsThisWeek
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50">
                <Lightbulb className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Tips Approved
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {loadingTips ? (
                    <span className="text-gray-300">--</span>
                  ) : (
                    tipsApproved
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-green-50">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Approval Status
                </p>
                <p className="text-lg font-semibold mt-1">
                  {loadingTips ? (
                    <span className="text-gray-300">--</span>
                  ) : tipsThisWeek === 0 ? (
                    <span className="text-gray-400">No queue</span>
                  ) : allApproved ? (
                    <span className="text-green-600">All Approved</span>
                  ) : (
                    <span className="text-amber-600">
                      {tipsApproved}/{tipsThisWeek} Approved
                    </span>
                  )}
                </p>
              </div>
              <div
                className="p-2.5 rounded-lg"
                style={{ backgroundColor: `${themeColorHex}15` }}
              >
                <Clock className="h-5 w-5" style={{ color: themeColorHex }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* This Week's Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb
                  className="h-5 w-5"
                  style={{ color: themeColorHex }}
                />
                This Week&apos;s Queue
                {weeklyTips.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-white text-xs"
                    style={{ backgroundColor: themeColorHex }}
                  >
                    {weeklyTips.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Tips scheduled for delivery this week
              </CardDescription>
            </div>
            {weeklyTips.length > 0 && !allApproved && (
              <Button
                onClick={handleApproveAllTips}
                disabled={approvingTips}
                size="sm"
                style={{ backgroundColor: themeColorHex }}
                className="text-white"
              >
                {approvingTips ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <ThumbsUp className="h-3 w-3 mr-1" />
                )}
                Approve All
              </Button>
            )}
            {allApproved && weeklyTips.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <CheckCircle className="h-4 w-4" />
                All Approved
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingTips ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tips...
            </div>
          ) : weeklyTips.length === 0 ? (
            <div className="text-center py-10">
              <Lightbulb className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium mb-1">
                No tips prepared yet
              </p>
              <p className="text-sm text-gray-400 mb-4">
                Generate weekly tips to fill the queue
              </p>
              <Button
                onClick={handlePrepareWeekly}
                disabled={preparingWeekly}
                style={{ backgroundColor: themeColorHex }}
                className="text-white"
              >
                {preparingWeekly ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Lightbulb className="mr-2 h-4 w-4" />
                    Prepare Weekly Content
                  </>
                )}
              </Button>
              {prepareError && (
                <p className="text-sm text-red-600 mt-3">{prepareError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {weeklyTips.map((tip, idx) => {
                const isEditing = editingTipIndex === idx;
                const isSaving = savingTipIndex === idx;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-lg border bg-gray-50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold capitalize text-gray-700">
                          {tip.dayName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {tip.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {tip.approved ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-amber-700 bg-amber-100 text-xs"
                          >
                            Pending
                          </Badge>
                        )}
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTipIndex(idx);
                              setEditingTipText(tip.tip);
                            }}
                            className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                            title="Edit tip"
                          >
                            <Pencil className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editingTipText}
                          onChange={(e) => setEditingTipText(e.target.value)}
                          rows={3}
                          className="text-sm"
                          disabled={isSaving}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveTip(idx)}
                            disabled={isSaving || !editingTipText.trim()}
                            style={{ backgroundColor: themeColorHex }}
                            className="text-white"
                          >
                            {isSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingTipIndex(null);
                              setEditingTipText("");
                            }}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {tip.tip}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Custom Tip */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare
              className="h-5 w-5"
              style={{ color: themeColorHex }}
            />
            Send Custom Tip
          </CardTitle>
          <CardDescription>
            Write and send a tip directly to clients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="manualTip">Tip Text</Label>
            <Textarea
              id="manualTip"
              placeholder="Write a helpful pool care tip..."
              value={manualTip}
              onChange={(e) => setManualTip(e.target.value)}
              rows={3}
              disabled={sendingManualTip}
            />
          </div>

          <div className="space-y-2">
            <Label>Send Mode</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  tipSendMode === "test"
                    ? "text-white"
                    : "text-gray-500 border-gray-200 hover:border-gray-300"
                }`}
                style={
                  tipSendMode === "test"
                    ? {
                        backgroundColor: themeColorHex,
                        borderColor: themeColorHex,
                      }
                    : {}
                }
                onClick={() => setTipSendMode("test")}
              >
                Test (one number)
              </button>
              <button
                type="button"
                className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  tipSendMode === "all"
                    ? "text-white"
                    : "text-gray-500 border-gray-200 hover:border-gray-300"
                }`}
                style={
                  tipSendMode === "all"
                    ? {
                        backgroundColor: themeColorHex,
                        borderColor: themeColorHex,
                      }
                    : {}
                }
                onClick={() => setTipSendMode("all")}
              >
                Send to All Clients
              </button>
            </div>
          </div>

          {tipSendMode === "test" && (
            <div className="space-y-1.5">
              <Label htmlFor="testPhone">Phone Number</Label>
              <Input
                id="testPhone"
                placeholder="e.g. 0501234567"
                value={tipTestPhone}
                onChange={(e) => setTipTestPhone(e.target.value)}
                disabled={sendingManualTip}
              />
            </div>
          )}

          <Button
            onClick={handleSendManualTip}
            disabled={
              sendingManualTip ||
              !manualTip.trim() ||
              (tipSendMode === "test" && !tipTestPhone.trim())
            }
            style={{ backgroundColor: themeColorHex }}
            className="text-white w-full"
          >
            {sendingManualTip ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {tipSendMode === "test" ? "Send Test" : "Send to All"}
              </>
            )}
          </Button>

          {manualTipSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
              <CheckCircle className="h-4 w-4" />
              {manualTipSuccess}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
