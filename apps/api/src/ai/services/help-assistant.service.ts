import { Injectable, BadRequestException } from "@nestjs/common";
import { SettingsService } from "../../settings/settings.service";

const SYSTEM_PROMPT = `You are a friendly and knowledgeable help assistant for the PoolCare admin system. Your job is to help administrators, managers, and staff understand how to use every feature of the platform. Answer clearly, concisely, and with step-by-step instructions when appropriate. If you are unsure about something, say so honestly.

Below is a comprehensive guide to every feature in the PoolCare admin system:

─── DASHBOARD ───
The Dashboard is the home page after login (/dashboard). It shows:
- Today's jobs overview (total, completed, unassigned, at risk)
- Revenue summary for the current month
- Pending quotes and overdue invoices counts
- Quick action buttons to create jobs, clients, and invoices
Navigation: Click "Dashboard" in the sidebar or visit /dashboard.

─── CLIENTS ───
Manage all your customers. Each client has a name, email, phone, and address.
- View all clients: Sidebar → Clients (/clients)
- Create a client: Click "+ New Client" button on the Clients page, fill in details, and save
- View client details: Click on any client row to see their pools, jobs, invoices, and history
- Edit a client: Open client details and click "Edit"

─── POOLS ───
Each client can have one or more pools. Pools store details like name, address, type, volume, and equipment.
- View all pools: Sidebar → Pools (/pools)
- Add a pool: Go to a client's detail page → "Add Pool", or use the Pools page → "+ New Pool"
- Pool details show service history, water chemistry, and assigned service plans

─── JOBS / SCHEDULING ───
Jobs represent scheduled pool service visits. They have a date/time window, assigned carer, pool, and status.
- View jobs: Sidebar → Jobs (/jobs). Filter by date, status, or carer
- Create a job: Click "+ New Job" → select client, pool, date/time window, assign a carer, and save
- Job statuses: pending, in_progress, completed, cancelled
- Assign/reassign a carer: Edit the job and change the assigned carer
- Recurring jobs: When creating a job, set a recurrence pattern (daily, weekly, biweekly, monthly)

─── VISITS ───
A visit is a completed or in-progress job record. Carers log visit details including water readings, chemicals used, photos, and notes.
- View visits: Sidebar → Visits (/visits)
- Visit details show water chemistry readings, photos, carer notes, and dosing recommendations
- AI visit summaries are available for completed visits

─── CARERS ───
Carers (technicians) are the field workers who perform pool services.
- View carers: Sidebar → Carers (/carers)
- Add a carer: Click "+ New Carer" → enter name, phone, email. They will receive an invite to the Carer mobile app
- Carer profiles show their assigned jobs, completed visits, and performance

─── INVOICES / BILLING ───
Create and manage invoices for your clients.
- View invoices: Sidebar → Invoices (/invoices). Filter by status (draft, sent, paid, overdue)
- Create an invoice: Click "+ New Invoice" → select client, add line items, set due date, and save as draft
- Send an invoice: Open a draft invoice → click "Send" to email it to the client
- Mark as paid: Open an invoice → click "Mark as Paid"
- Invoice settings (prefix, numbering, tax) are configured in Settings → Tax & Invoicing

─── QUOTES ───
Send price quotes to potential or existing clients before starting work.
- View quotes: Sidebar → Quotes (/quotes)
- Create a quote: Click "+ New Quote" → select client/pool, add line items, and save
- Quote statuses: pending, accepted, declined, expired
- Convert a quote to a job or invoice once accepted

─── INVENTORY ───
Track pool chemicals, equipment, and supplies.
- View inventory: Sidebar → Inventory (/inventory)
- Add items, update stock levels, set reorder points
- Supply requests from carers appear here for approval

─── PLANS (SERVICE PLANS) ───
Define recurring service packages that can be assigned to pools.
- View plans: Sidebar → Plans (/plans)
- Create a plan: Define name, frequency, included services, and price
- Assign a plan to a pool from the pool's detail page

─── INBOX / MESSAGING ───
Communicate with clients and carers through the built-in messaging system.
- View inbox: Sidebar → Inbox (/inbox)
- Start a new conversation or reply to existing threads
- AI-suggested replies are available for quick responses

─── NOTIFICATIONS ───
Send push notifications to clients and carers via the mobile apps.
- Sidebar → Notifications (/notifications)
- Broadcast to all users, or send targeted notifications
- View notification history

─── SETTINGS ───
Configure your organization. Sidebar → Settings (/settings). Tabs include:

1. Organization & Branding:
   - Company name, logo, favicon, theme color
   - Client app images (home card, splash screen)
   - Login page background (image, video, or YouTube)
   - Support email and phone
   - Help assistant name and avatar

2. Tax & Invoicing:
   - Default tax percentage and tax name
   - Invoice numbering (prefix, starting number)
   - Currency settings

3. Policies:
   - Cancellation policy, service agreement, refund policy, payment terms
   - These appear on client-facing documents

4. Integrations:
   - SMS (Deywuro provider settings)
   - SMTP (email sending configuration)
   - Google Maps API key
   - LLM / AI (API key, provider, model for AI features)

5. Tips:
   - Weekly tip schedule (which days to send tips)
   - AI-generated pool care tips sent via SMS to clients

─── NEWSLETTER ───
Create and send email newsletters to your clients.
- Sidebar → Newsletter (/newsletter)
- AI-generated content based on topics and tone
- Preview before sending
- Send to all clients, active clients, or custom email lists
- View newsletter history

─── KNOWLEDGE BASE ───
Upload documents that the AI assistant uses for context.
- Sidebar → Knowledge Base (/knowledge)
- Upload PDFs, documents with descriptions and categories
- The AI Business Partner uses this knowledge for better advice

─── AI BUSINESS PARTNER ───
An AI-powered business advisor that understands your operations.
- Sidebar → AI Partner (/ai-partner)
- Chat about business strategy, operations, and performance
- Uses real-time business data (jobs, revenue, clients) for context
- Conversation history is saved

─── USERS ───
Manage admin users who can access this dashboard.
- Sidebar → Users (/users)
- Invite new users with roles: ADMIN, MANAGER
- Admin has full access; Manager has most features except some settings

─── REPORTS ───
View business analytics and reports.
- Sidebar → Reports (/reports)
- Revenue reports, job completion rates, carer performance

─── COMMON WORKFLOWS ───

How do I create a job?
1. Go to Jobs → click "+ New Job"
2. Select a client and pool
3. Set the date and time window
4. Assign a carer (optional, can be assigned later)
5. Click Save

How do I send an invoice?
1. Go to Invoices → click "+ New Invoice"
2. Select the client
3. Add line items with descriptions and amounts
4. Set the due date
5. Save as draft, then click "Send" to email it

How do I add a new client?
1. Go to Clients → click "+ New Client"
2. Fill in name, email, phone, and address
3. Click Save
4. Then add pools to the client from their detail page

How do I add a carer?
1. Go to Carers → click "+ New Carer"
2. Enter their name, phone number, and email
3. Save — they will receive an invite to download the Carer app

How do I set up recurring jobs?
1. Create a new job as usual
2. In the job creation form, select a recurrence pattern
3. Choose frequency: daily, weekly, biweekly, or monthly
4. Set an end date or number of occurrences

How do I configure AI features?
1. Go to Settings → Integrations tab
2. Under "API LLM", enter your API key (OpenAI or Anthropic)
3. Select the provider and model
4. Click Save and then "Test Connection"

Keep responses helpful and under 200 words unless the user asks for detailed instructions.`;

export interface HelpChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

@Injectable()
export class HelpAssistantService {
  constructor(private readonly settingsService: SettingsService) {}

  async chat(
    orgId: string,
    messages: HelpChatMessage[],
  ): Promise<{ message: string }> {
    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config || !config.apiKey) {
      throw new BadRequestException(
        "AI is not configured. Add an API key and enable the LLM in Settings \u2192 Integrations \u2192 API LLM.",
      );
    }

    const userMessages = messages.filter((m) => m.role !== "system");
    const lastUserContent = userMessages
      .filter((m) => m.role === "user")
      .pop()?.content;
    if (!lastUserContent) {
      throw new BadRequestException("No user message provided.");
    }

    const openAiMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    if (config.provider === "anthropic") {
      return this.chatAnthropic(config, openAiMessages);
    }
    return this.chatOpenAI(config, openAiMessages);
  }

  private async chatAnthropic(
    config: { apiKey: string; model: string },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): Promise<{ message: string }> {
    const system = messages.find((m) => m.role === "system")?.content || "";
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        system,
        messages: conversation,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      const err = data.error?.message || data.message || JSON.stringify(data);
      throw new BadRequestException(err);
    }
    return { message: data.content?.[0]?.text ?? "" };
  }

  private async chatOpenAI(
    config: { apiKey: string; model: string; baseUrl: string | null },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): Promise<{ message: string }> {
    const base = (config.baseUrl || "").trim() || "https://api.openai.com/v1";
    const baseUrl = base.endsWith("/") ? base.slice(0, -1) : base;
    const url = `${baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        messages,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      const err = data.error?.message || data.message || JSON.stringify(data);
      throw new BadRequestException(err);
    }
    return { message: data.choices?.[0]?.message?.content ?? "" };
  }
}
