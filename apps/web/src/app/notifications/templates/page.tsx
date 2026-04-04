"use client";

import { useState, useEffect } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Edit2,
  Mail,
  MessageSquare,
  Bell,
  Phone,
  Eye,
  Save,
  RotateCcw,
  Search,
} from "lucide-react";
import { useTheme } from "@/contexts/theme-context";

interface NotificationTemplate {
  key: string;
  name: string;
  description: string;
  channels: string[];
  defaultSubject: string;
  defaultBody: string;
  variables: string[];
  category: "transactional" | "marketing" | "system";
  // Overrides saved locally
  customSubject?: string;
  customBody?: string;
  usageCount?: number;
}

const BUILT_IN_TEMPLATES: NotificationTemplate[] = [
  {
    key: "job_reminder",
    name: "Job Reminder",
    description: "Sent to carers before a scheduled job",
    channels: ["push", "sms"],
    defaultSubject: "Job Reminder",
    defaultBody:
      "Reminder: You have a job at {{poolName}}{{time}} today. Check your app for details.",
    variables: ["poolName", "time"],
    category: "transactional",
  },
  {
    key: "visit_complete",
    name: "Visit Complete",
    description: "Sent to clients after a pool service visit is completed",
    channels: ["push", "email", "sms", "whatsapp"],
    defaultSubject: "Your Pool Service Visit Report is Ready",
    defaultBody:
      "Your pool service visit is complete! View your report: {{reportUrl}}",
    variables: ["reportUrl"],
    category: "transactional",
  },
  {
    key: "quote_ready",
    name: "Quote Ready",
    description: "Sent to clients when a new quote is ready for review",
    channels: ["push", "email", "sms", "whatsapp"],
    defaultSubject: "New Quote Ready for Approval",
    defaultBody:
      "A new quote is ready for your review. View and approve: {{quoteUrl}}",
    variables: ["quoteUrl"],
    category: "transactional",
  },
  {
    key: "broadcast",
    name: "Broadcast",
    description: "General broadcast push notification to app users",
    channels: ["push"],
    defaultSubject: "{{title}}",
    defaultBody: "{{body}}",
    variables: ["title", "body"],
    category: "marketing",
  },
  {
    key: "invoice_sent",
    name: "Invoice Sent",
    description: "Sent to clients when a new invoice is generated",
    channels: ["email", "sms", "whatsapp"],
    defaultSubject: "New Invoice from {{orgName}}",
    defaultBody:
      "You have a new invoice of {{amount}}. View and pay: {{invoiceUrl}}",
    variables: ["orgName", "amount", "invoiceUrl"],
    category: "transactional",
  },
  {
    key: "payment_received",
    name: "Payment Received",
    description: "Confirmation sent after a payment is processed",
    channels: ["email", "push"],
    defaultSubject: "Payment Confirmed",
    defaultBody:
      "Thank you! Your payment of {{amount}} has been received.",
    variables: ["amount"],
    category: "transactional",
  },
  {
    key: "welcome",
    name: "Welcome",
    description: "Sent to new clients when they are onboarded",
    channels: ["email"],
    defaultSubject: "Welcome to {{orgName}}!",
    defaultBody:
      "Welcome to {{orgName}}! We are excited to take care of your pool. Download the app to track your service visits and water quality.",
    variables: ["orgName"],
    category: "system",
  },
];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-3.5 w-3.5" />,
  sms: <MessageSquare className="h-3.5 w-3.5" />,
  push: <Bell className="h-3.5 w-3.5" />,
  whatsapp: <Phone className="h-3.5 w-3.5" />,
};

const CHANNEL_COLORS: Record<string, string> = {
  email: "bg-purple-100 text-purple-700",
  sms: "bg-blue-100 text-blue-700",
  push: "bg-emerald-100 text-emerald-800",
  whatsapp: "bg-green-100 text-green-700",
};

const CATEGORY_COLORS: Record<string, string> = {
  transactional: "bg-blue-50 text-blue-700 border-blue-200",
  marketing: "bg-amber-50 text-amber-700 border-amber-200",
  system: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function NotificationTemplatesPage() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTemplate, setEditingTemplate] =
    useState<NotificationTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [previewTemplate, setPreviewTemplate] =
    useState<NotificationTemplate | null>(null);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    loadTemplates();
    fetchUsageCounts();
  }, []);

  const loadTemplates = () => {
    // Load any custom overrides from localStorage
    const saved = localStorage.getItem("notification_template_overrides");
    const overrides: Record<
      string,
      { customSubject?: string; customBody?: string }
    > = saved ? JSON.parse(saved) : {};

    const merged = BUILT_IN_TEMPLATES.map((t) => ({
      ...t,
      customSubject: overrides[t.key]?.customSubject,
      customBody: overrides[t.key]?.customBody,
    }));

    setTemplates(merged);
    setLoading(false);
  };

  const fetchUsageCounts = async () => {
    try {
      const response = await fetch(`${API_URL}/notifications?limit=500`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const counts: Record<string, number> = {};
        (data.items || []).forEach((n: { template?: string }) => {
          if (n.template) {
            counts[n.template] = (counts[n.template] || 0) + 1;
          }
        });
        setUsageCounts(counts);
      }
    } catch (error) {
      console.error("Failed to fetch usage counts:", error);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.key.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.channels.some((c) => c.includes(q))
    );
  });

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setEditSubject(
      template.customSubject || template.defaultSubject
    );
    setEditBody(template.customBody || template.defaultBody);
  };

  const handleSave = () => {
    if (!editingTemplate) return;

    const saved = localStorage.getItem("notification_template_overrides");
    const overrides: Record<
      string,
      { customSubject?: string; customBody?: string }
    > = saved ? JSON.parse(saved) : {};

    overrides[editingTemplate.key] = {
      customSubject:
        editSubject !== editingTemplate.defaultSubject
          ? editSubject
          : undefined,
      customBody:
        editBody !== editingTemplate.defaultBody ? editBody : undefined,
    };

    localStorage.setItem(
      "notification_template_overrides",
      JSON.stringify(overrides)
    );

    setEditingTemplate(null);
    loadTemplates();
  };

  const handleReset = () => {
    if (!editingTemplate) return;
    setEditSubject(editingTemplate.defaultSubject);
    setEditBody(editingTemplate.defaultBody);
  };

  const handleResetToDefault = (templateKey: string) => {
    const saved = localStorage.getItem("notification_template_overrides");
    const overrides: Record<
      string,
      { customSubject?: string; customBody?: string }
    > = saved ? JSON.parse(saved) : {};

    delete overrides[templateKey];
    localStorage.setItem(
      "notification_template_overrides",
      JSON.stringify(overrides)
    );
    loadTemplates();
  };

  const renderPreviewBody = (template: NotificationTemplate) => {
    const body = template.customBody || template.defaultBody;
    // Replace variables with sample values for preview
    const sampleValues: Record<string, string> = {
      poolName: "123 Main St Pool",
      time: " at 09:00",
      reportUrl: "https://app.example.com/visits/abc123",
      quoteUrl: "https://app.example.com/quotes/abc123",
      invoiceUrl: "https://app.example.com/invoices/abc123",
      orgName: "PoolCare Pro",
      amount: "R 1,250.00",
      title: "Service Update",
      body: "Pool services resume Monday. Thank you for your patience.",
    };

    let preview = body;
    template.variables.forEach((v) => {
      preview = preview.replace(
        new RegExp(`\\{\\{${v}\\}\\}`, "g"),
        sampleValues[v] || `[${v}]`
      );
    });
    return preview;
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/notifications")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Notification Templates</h1>
            <p className="text-gray-600">
              Manage message templates used across all notification channels
            </p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3 px-4">
          <p className="text-sm text-amber-800">
            These are the built-in notification templates used by the system.
            You can customize the subject and body text for each template.
            Variables like{" "}
            <code className="bg-amber-100 px-1 rounded text-xs">
              {"{{variableName}}"}
            </code>{" "}
            will be replaced with actual values when notifications are sent.
          </p>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Templates ({filteredTemplates.length})</CardTitle>
          <CardDescription>
            Click edit to customize message content for each template
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Loading templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No templates match your search
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Body Preview</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.key}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {template.description}
                        </div>
                        <Badge
                          variant="outline"
                          className={`mt-1 text-[10px] ${CATEGORY_COLORS[template.category]}`}
                        >
                          {template.category}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {template.channels.map((channel) => (
                          <span
                            key={channel}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${CHANNEL_COLORS[channel]}`}
                          >
                            {CHANNEL_ICONS[channel]}
                            {channel}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {template.customSubject || template.defaultSubject}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      <p className="text-sm text-gray-600 truncate">
                        {template.customBody || template.defaultBody}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium" style={{ color: theme.primary }}>
                        {usageCounts[template.key] || 0}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">sent</span>
                    </TableCell>
                    <TableCell>
                      {template.customSubject || template.customBody ? (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 border-green-200 text-[10px]"
                        >
                          Customized
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                        >
                          Default
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewTemplate(template)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(template)}
                          style={{ color: theme.primary }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {(template.customSubject || template.customBody) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleResetToDefault(template.key)
                            }
                            className="text-gray-400 hover:text-red-600"
                            title="Reset to default"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingTemplate}
        onOpenChange={(open) => {
          if (!open) setEditingTemplate(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Template: {editingTemplate?.name}</DialogTitle>
            <DialogDescription>
              Customize the subject and body for this notification template.
              Use{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                {"{{variable}}"}
              </code>{" "}
              syntax for dynamic values.
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="mb-1.5 block text-sm font-medium">
                  Available variables
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {editingTemplate.variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="inline-flex items-center px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
                      onClick={() =>
                        setEditBody((prev) => prev + `{{${v}}}`)
                      }
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block">Subject</Label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Notification subject..."
                />
              </div>

              <div>
                <Label className="mb-1.5 block">Body</Label>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={5}
                  placeholder="Notification message body..."
                  className="resize-none"
                />
              </div>

              <div>
                <Label className="mb-1.5 block text-sm text-gray-500">
                  Channels
                </Label>
                <div className="flex gap-1.5">
                  {editingTemplate.channels.map((channel) => (
                    <span
                      key={channel}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${CHANNEL_COLORS[channel]}`}
                    >
                      {CHANNEL_ICONS[channel]}
                      {channel}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset to Default
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingTemplate(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                style={{ backgroundColor: theme.primary }}
                className="text-white"
              >
                <Save className="h-4 w-4 mr-1" />
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewTemplate}
        onOpenChange={(open) => {
          if (!open) setPreviewTemplate(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
            <DialogDescription>
              How this notification will appear with sample data
            </DialogDescription>
          </DialogHeader>

          {previewTemplate && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Subject
                  </p>
                  <p className="font-medium text-gray-900">
                    {previewTemplate.customSubject ||
                      previewTemplate.defaultSubject}
                  </p>
                </div>
                <hr />
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Message
                  </p>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {renderPreviewBody(previewTemplate)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Delivered via
                </p>
                <div className="flex gap-1.5">
                  {previewTemplate.channels.map((channel) => (
                    <span
                      key={channel}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${CHANNEL_COLORS[channel]}`}
                    >
                      {CHANNEL_ICONS[channel]}
                      {channel}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewTemplate(null)}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                if (previewTemplate) {
                  handleEdit(previewTemplate);
                  setPreviewTemplate(null);
                }
              }}
              style={{ backgroundColor: theme.primary }}
              className="text-white"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
