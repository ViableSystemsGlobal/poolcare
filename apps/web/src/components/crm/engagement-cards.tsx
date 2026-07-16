"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { dedupeMembers } from "@/lib/members";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/theme-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, CheckSquare, Square, Video, Send, Bell, Mail, MessageSquare, CalendarClock,
} from "lucide-react";

const fmtDate = (iso?: string) => (!iso ? "—" : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));

const channelMeta: Record<string, { icon: any; label: string; badge: string }> = {
  EMAIL: { icon: Mail, label: "Email", badge: "bg-green-100 text-green-800" },
  SMS: { icon: MessageSquare, label: "SMS", badge: "bg-teal-100 text-teal-800" },
  PUSH: { icon: Bell, label: "Push", badge: "bg-orange-100 text-orange-800" },
};

type EntityType = "account" | "opportunity" | "contact";

interface Props {
  entityType: EntityType;
  entityId: string;
  activities: any[];
  recipient: { email?: string | null; phone?: string | null; ownerName?: string | null };
  onChanged: () => void;
}

export function CrmEngagementCards({ entityType, entityId, activities, recipient, onChanged }: Props) {
  const { toast } = useToast();
  const { getThemeColor } = useTheme();
  const accent = getThemeColor();

  const acts = activities || [];
  const tasks = acts.filter((a) => a.type === "TASK");
  const meetings = acts.filter((a) => a.type === "MEETING");
  const comms = acts.filter((a) => ["EMAIL", "SMS", "PUSH"].includes(a.type));

  const fkey = entityType === "account" ? "accountId" : entityType === "opportunity" ? "opportunityId" : "contactId";
  const sendFn =
    entityType === "account" ? api.sendAccountMessage :
    entityType === "opportunity" ? api.sendOpportunityMessage :
    api.sendContactMessage;

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ body: "", dueDate: "", assignedToId: "" });
  const [members, setMembers] = useState<any[]>([]);
  const [savingTask, setSavingTask] = useState(false);

  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ body: "", dueDate: "" });
  const [savingMeeting, setSavingMeeting] = useState(false);

  const [commsOpen, setCommsOpen] = useState(false);
  const [commsForm, setCommsForm] = useState<{ channel: "email" | "sms" | "push"; subject: string; body: string }>({ channel: "email", subject: "", body: "" });
  const [sendingComms, setSendingComms] = useState(false);

  const addTask = async () => {
    if (!taskForm.body.trim()) return;
    setSavingTask(true);
    try {
      await api.createActivity({ [fkey]: entityId, type: "TASK", body: taskForm.body, dueDate: taskForm.dueDate || undefined, assignedToId: taskForm.assignedToId || undefined });
      setTaskForm({ body: "", dueDate: "", assignedToId: "" });
      setTaskOpen(false);
      onChanged();
      toast({ title: "Task created successfully!", variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    } finally { setSavingTask(false); }
  };

  const addMeeting = async () => {
    if (!meetingForm.body.trim()) return;
    setSavingMeeting(true);
    try {
      await api.createActivity({ [fkey]: entityId, type: "MEETING", body: meetingForm.body, dueDate: meetingForm.dueDate || undefined });
      setMeetingForm({ body: "", dueDate: "" });
      setMeetingOpen(false);
      onChanged();
      toast({ title: "Meeting scheduled successfully!", variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to schedule meeting", variant: "destructive" });
    } finally { setSavingMeeting(false); }
  };

  const toggleComplete = async (activityId: string) => {
    try { await api.completeActivity(activityId); onChanged(); }
    catch { toast({ title: "Error", description: "Could not update task", variant: "destructive" }); }
  };

  const sendComms = async () => {
    if (!commsForm.body.trim()) return;
    setSendingComms(true);
    try {
      await sendFn(entityId, { channel: commsForm.channel, subject: commsForm.subject || undefined, body: commsForm.body });
      setCommsForm({ channel: commsForm.channel, subject: "", body: "" });
      setCommsOpen(false);
      onChanged();
      const label = commsForm.channel === "sms" ? "SMS" : commsForm.channel === "push" ? "Push notification" : "Email";
      toast({ title: `${label} sent successfully!`, variant: "success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to send message", variant: "destructive" });
    } finally { setSendingComms(false); }
  };

  return (
    <>
      {/* Tasks */}
      <SectionCard title="Tasks" onAdd={() => { setTaskForm({ body: "", dueDate: "", assignedToId: "" }); setTaskOpen(true); if (members.length === 0) { api.getMembers().then((d: any) => setMembers(dedupeMembers(d?.items))).catch(() => {}); } }}>
        {tasks.length > 0 ? (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {tasks.map((t: any) => {
              const done = !!t.completedAt;
              const overdue = !done && t.dueDate && new Date(t.dueDate) < new Date();
              return (
                <div key={t.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <button onClick={() => !done && toggleComplete(t.id)} className="mt-0.5 shrink-0" disabled={done}>
                    {done ? <CheckSquare className="w-4 h-4 text-green-600" /> : <Square className="w-4 h-4 text-gray-400 hover:text-gray-600" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${done ? "line-through text-gray-400" : "text-gray-900"}`}>{t.body}</p>
                    {t.dueDate && (
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                        <CalendarClock className="w-3 h-3" /> {fmtDate(t.dueDate)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<CheckSquare className="w-12 h-12" />} text="No tasks assigned" />
        )}
      </SectionCard>

      {/* Meetings & Calls */}
      <SectionCard title="Meetings & Calls" onAdd={() => { setMeetingForm({ body: "", dueDate: "" }); setMeetingOpen(true); }}>
        {meetings.length > 0 ? (
          <div className="max-h-64 overflow-y-auto space-y-3">
            {meetings.map((m: any) => (
              <div key={m.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-2">
                  <Video className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{m.body}</p>
                    {m.dueDate && <p className="text-xs text-gray-500 mt-0.5">{fmtDate(m.dueDate)}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Video className="w-12 h-12" />} text="No meetings scheduled" />
        )}
      </SectionCard>

      {/* Communications */}
      <SectionCard title="Communications" onAdd={() => { setCommsForm({ channel: "email", subject: "", body: "" }); setCommsOpen(true); }}>
        {comms.length > 0 ? (
          <div className="max-h-64 overflow-y-auto space-y-3">
            {comms.map((c: any) => {
              const meta = channelMeta[c.type] || channelMeta.EMAIL;
              const Icon = meta.icon;
              return (
                <div key={c.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                      <Icon className="w-3 h-3" /> {meta.label}
                    </span>
                    <span className="text-xs text-gray-500">{fmtDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Send className="w-12 h-12" />} text="No messages sent" />
        )}
      </SectionCard>

      {/* Task dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Task *</label>
              <Input value={taskForm.body} onChange={(e) => setTaskForm({ ...taskForm, body: e.target.value })} placeholder="e.g. Send follow-up quote" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <Input type="datetime-local" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assign to</label>
              <select
                value={taskForm.assignedToId}
                onChange={(e) => setTaskForm({ ...taskForm, assignedToId: e.target.value })}
                className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm bg-white"
              >
                <option value="">Me (creator)</option>
                {members.map((m: any) => (
                  <option key={m.userId} value={m.userId}>{m.user?.name || m.user?.email || m.userId}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button disabled={savingTask || !taskForm.body.trim()} onClick={addTask}>{savingTask ? "Saving…" : "Create task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meeting dialog */}
      <Dialog open={meetingOpen} onOpenChange={setMeetingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule meeting / call</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Details *</label>
              <Input value={meetingForm.body} onChange={(e) => setMeetingForm({ ...meetingForm, body: e.target.value })} placeholder="e.g. Contract review call" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">When</label>
              <Input type="datetime-local" value={meetingForm.dueDate} onChange={(e) => setMeetingForm({ ...meetingForm, dueDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMeetingOpen(false)}>Cancel</Button>
            <Button disabled={savingMeeting || !meetingForm.body.trim()} onClick={addMeeting}>{savingMeeting ? "Saving…" : "Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Communications dialog */}
      <Dialog open={commsOpen} onOpenChange={setCommsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send message</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["email", "sms", "push"] as const).map((ch) => {
                const active = commsForm.channel === ch;
                const Icon = ch === "email" ? Mail : ch === "sms" ? MessageSquare : Bell;
                return (
                  <button
                    key={ch}
                    onClick={() => setCommsForm({ ...commsForm, channel: ch })}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-colors ${active ? "text-white border-transparent" : "text-gray-600 hover:bg-gray-50"}`}
                    style={active ? { backgroundColor: accent } : undefined}
                  >
                    <Icon className="w-4 h-4" /> {ch === "sms" ? "SMS" : ch.charAt(0).toUpperCase() + ch.slice(1)}
                  </button>
                );
              })}
            </div>
            {commsForm.channel === "email" && (
              <p className="text-xs text-gray-500">Sends to <span className="font-medium">{recipient.email || "— no email on file —"}</span></p>
            )}
            {commsForm.channel === "sms" && (
              <p className="text-xs text-gray-500">Sends to <span className="font-medium">{recipient.phone || "— no phone on file —"}</span></p>
            )}
            {commsForm.channel === "push" && (
              <p className="text-xs text-gray-500">Push goes to the assigned owner&apos;s devices{recipient.ownerName ? <> (<span className="font-medium">{recipient.ownerName}</span>)</> : " — none assigned"}.</p>
            )}
            {(commsForm.channel === "email" || commsForm.channel === "push") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">{commsForm.channel === "email" ? "Subject" : "Title"}</label>
                <Input value={commsForm.subject} onChange={(e) => setCommsForm({ ...commsForm, subject: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Message *</label>
              <Textarea value={commsForm.body} onChange={(e) => setCommsForm({ ...commsForm, body: e.target.value })} rows={5} placeholder="Type your message…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCommsOpen(false)}>Cancel</Button>
            <Button disabled={sendingComms || !commsForm.body.trim()} onClick={sendComms}>
              <Send className="w-4 h-4 mr-1.5" /> {sendingComms ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionCard({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {onAdd && (
          <Button variant="outline" size="sm" className="hover:bg-gray-50" onClick={onAdd}>
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>
      {children}
    </Card>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-gray-300 mx-auto mb-3 w-fit">{icon}</div>
      <p className="text-gray-500">{text}</p>
    </div>
  );
}
