import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SettingsService } from "../../settings/settings.service";

const SYSTEM_PERSONA = `You are the AI Business Partner for a pool care company. You have the strategic acumen and decision-making clarity of the world's top business leaders (think Buffett, Musk, Bezos, Gates, Arnault, etc.). You are direct, concise, and actionable. You focus on:
- Revenue and cash flow
- Operational efficiency and capacity
- Customer retention and growth
- Risk and prioritization
- Clear next steps

You speak in a conversational but professional tone. You use the business context provided below to give specific, grounded advice. If the user asks about something not in the context, say so and give general best-practice guidance. Keep responses focused and under 300 words unless the user asks for depth.`;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

@Injectable()
export class BusinessPartnerService {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Build a text summary of the organization's current business state for the LLM.
   */
  async getBusinessContext(orgId: string): Promise<string> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const orgName = org?.name || "This organization";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const [
      todayJobsTotal,
      todayUnassigned,
      todayCompleted,
      atRiskJobs,
      pendingQuotes,
      totalClients,
      activePools,
      overdueInvoices,
      draftInvoices,
      monthlyRevenueCents,
      urgentSupplyRequests,
      recentQuotes,
    ] = await Promise.all([
      prisma.job.count({
        where: {
          orgId,
          windowStart: { gte: today, lt: tomorrow },
          status: { not: "cancelled" },
        },
      }),
      prisma.job.count({
        where: {
          orgId,
          assignedCarerId: null,
          windowStart: { gte: today, lt: tomorrow },
          status: { not: "cancelled" },
        },
      }),
      prisma.job.count({
        where: {
          orgId,
          status: "completed",
          windowStart: { gte: today, lt: tomorrow },
        },
      }),
      prisma.job.count({
        where: {
          orgId,
          windowEnd: { lt: new Date() },
          status: { notIn: ["completed", "cancelled"] },
          windowStart: { gte: today, lt: tomorrow },
        },
      }),
      prisma.quote.count({ where: { orgId, status: "pending" } }),
      prisma.client.count({ where: { orgId } }),
      prisma.pool.count({
        where: {
          orgId,
          servicePlans: { some: { status: "active" } },
        },
      }),
      prisma.invoice.count({
        where: {
          orgId,
          status: { notIn: ["paid", "cancelled"] },
          dueDate: { lt: today },
        },
      }),
      prisma.invoice.count({
        where: { orgId, status: "draft" },
      }),
      prisma.invoice
        .findMany({
          where: {
            orgId,
            status: "paid",
            paidAt: { gte: thisMonthStart, lt: nextMonthStart },
          },
          select: { paidCents: true },
        })
        .then((list) => list.reduce((s, i) => s + (i.paidCents || 0), 0)),
      prisma.supplyRequest.count({
        where: { orgId, status: "pending", priority: "urgent" },
      }),
      prisma.quote.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          totalCents: true,
          status: true,
          createdAt: true,
          pool: { select: { name: true } },
          client: { select: { name: true } },
        },
      }),
    ]);

    const monthlyRevenue = (monthlyRevenueCents / 100).toFixed(2);

    const lines: string[] = [
      `Organization: ${orgName}.`,
      `Date: ${today.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
      "",
      "— Today's operations —",
      `Jobs today: ${todayJobsTotal} total, ${todayCompleted} completed, ${todayUnassigned} unassigned, ${atRiskJobs} at risk (past window).`,
      "",
      "— Customers & capacity —",
      `Clients: ${totalClients}. Active pools (on service plans): ${activePools}.`,
      "",
      "— Revenue & pipeline —",
      `Pending quotes: ${pendingQuotes}. Draft invoices: ${draftInvoices}. Overdue invoices: ${overdueInvoices}.`,
      `Revenue this month (paid): ${monthlyRevenue} (local currency).`,
      "",
      "— Other —",
      `Urgent supply requests: ${urgentSupplyRequests}.`,
    ];

    if (recentQuotes.length > 0) {
      lines.push("", "— Recent quotes —");
      for (const q of recentQuotes) {
        lines.push(
          `- ${q.pool?.name || "Pool"} / ${q.client?.name || "Client"}: ${(q.totalCents / 100).toFixed(2)}, status: ${q.status}, created ${new Date(q.createdAt).toLocaleDateString()}`
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Send conversation to LLM, persist to history, return assistant reply and conversation id.
   */
  async chat(
    orgId: string,
    userId: string,
    payload: { conversationId?: string; messages: ChatMessage[] }
  ): Promise<{ message: string; conversationId: string; title: string }> {
    const config = await this.settingsService.getLlmConfig(orgId);
    if (!config || !config.apiKey) {
      throw new BadRequestException(
        "AI Business Partner is not configured. Add an API key and enable the LLM in Settings → Integrations → API LLM."
      );
    }

    const messages = payload.messages.filter((m) => m.role !== "system");
    const lastUserContent = messages.filter((m) => m.role === "user").pop()?.content;
    if (!lastUserContent) {
      throw new BadRequestException("No user message to send.");
    }

    let chat: { id: string; title: string; messages: ChatMessage[] } | null = null;
    if (payload.conversationId) {
      const existing = await prisma.businessPartnerChat.findFirst({
        where: {
          id: payload.conversationId,
          orgId,
          userId,
        },
      });
      if (existing) {
        chat = {
          id: existing.id,
          title: existing.title,
          messages: (existing.messages as ChatMessage[]) || [],
        };
      }
    }

    const conversationHistory = chat ? chat.messages : messages.slice(0, -1);
    const openAiHistory = [
      ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: lastUserContent },
    ];

    const businessContext = await this.getBusinessContext(orgId);
    const systemContent = `${SYSTEM_PERSONA}\n\n--- Current business context (use this for specific advice) ---\n${businessContext}\n--- End context ---`;

    const openAiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemContent },
      ...openAiHistory,
    ];

    let result: { message: string };
    if (config.provider === "anthropic") {
      result = await this.chatAnthropic(config, openAiMessages);
    } else {
      result = await this.chatOpenAI(config, openAiMessages);
    }

    const newMessages: ChatMessage[] = [
      ...(chat ? chat.messages : []),
      { role: "user", content: lastUserContent },
      { role: "assistant", content: result.message },
    ];

    const title =
      chat?.title ||
      (lastUserContent.length > 50 ? lastUserContent.slice(0, 47) + "..." : lastUserContent) ||
      "New chat";

    if (chat) {
      await prisma.businessPartnerChat.update({
        where: { id: chat.id },
        data: {
          messages: newMessages as any,
          title: chat.title || title,
          updatedAt: new Date(),
        },
      });
      return {
        message: result.message,
        conversationId: chat.id,
        title: chat.title || title,
      };
    }

    const created = await prisma.businessPartnerChat.create({
      data: {
        orgId,
        userId,
        title,
        messages: newMessages as any,
      },
    });
    return {
      message: result.message,
      conversationId: created.id,
      title: created.title,
    };
  }

  async listChats(orgId: string, userId: string) {
    const chats = await prisma.businessPartnerChat.findMany({
      where: { orgId, userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return { chats };
  }

  async getChat(orgId: string, userId: string, chatId: string) {
    const chat = await prisma.businessPartnerChat.findFirst({
      where: { id: chatId, orgId, userId },
    });
    if (!chat) throw new NotFoundException("Conversation not found");
    return {
      id: chat.id,
      title: chat.title,
      messages: (chat.messages as ChatMessage[]) || [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  async deleteChat(orgId: string, userId: string, chatId: string) {
    const chat = await prisma.businessPartnerChat.findFirst({
      where: { id: chatId, orgId, userId },
    });
    if (!chat) throw new NotFoundException("Conversation not found");
    await prisma.businessPartnerChat.delete({ where: { id: chatId } });
    return { ok: true };
  }

  private async chatAnthropic(
    config: { apiKey: string; model: string },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<{ message: string }> {
    const system = messages.find((m) => m.role === "system")?.content || "";
    const conversation = messages.filter((m) => m.role !== "system");
    const anthropicMessages = conversation.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

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
        system: system,
        messages: anthropicMessages,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      const err = data.error?.message || data.message || JSON.stringify(data);
      throw new BadRequestException(err);
    }
    const text = data.content?.[0]?.text ?? "";
    return { message: text };
  }

  private async chatOpenAI(
    config: { apiKey: string; model: string; baseUrl: string | null },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
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
    const text = data.choices?.[0]?.message?.content ?? "";
    return { message: text };
  }
}
