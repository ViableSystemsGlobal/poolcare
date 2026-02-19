import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SettingsService } from "../../settings/settings.service";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const POOL_COACH_PERSONA = `You are Kwame, a friendly and knowledgeable pool care assistant. You help clients understand their pool, interpret service visit results, answer pool chemistry questions, and guide them through using the app.

Be warm, clear, and concise — 2-4 sentences unless the client asks for more detail. Use simple language. When you reference numbers from the context (pH, chlorine, etc.) explain what they mean in plain terms.

If the client asks about:
- Pool chemistry: explain what the readings mean and whether they're in a good range.
- Next service / visit history: reference the recent visits in the context below.
- Invoices or payments: direct them to the Billing tab in the app.
- Reporting an issue: encourage them to use the "Report Issue" button on their pool.

Only reference facts from the context provided — never invent readings, dates, or service history.`;

@Injectable()
export class PoolCoachService {
  constructor(private readonly settingsService: SettingsService) {}

  private async getClientContext(orgId: string, userId: string): Promise<string> {
    const client = await prisma.client.findFirst({
      where: { orgId, userId },
      include: {
        pools: {
          include: {
            servicePlans: { where: { status: "active" }, take: 1 },
          },
          take: 5,
        },
      },
    });

    if (!client) return "No client profile found.";

    const lines: string[] = [`Client: ${client.name}.`, `Pools: ${client.pools.length}.`];

    for (const pool of client.pools) {
      const plan = pool.servicePlans[0];
      lines.push(`- ${pool.name} (${pool.type || "standard pool"}): ${plan ? "active service plan" : "no active service plan"}.`);
    }

    const recentVisits = await prisma.visitEntry.findMany({
      where: { orgId, job: { pool: { clientId: client.id } } },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        readings: { orderBy: { measuredAt: "desc" }, take: 1 },
        job: { include: { pool: { select: { name: true } } } },
      },
    });

    if (recentVisits.length > 0) {
      lines.push("", "Recent service visits:");
      for (const v of recentVisits) {
        const date = new Date(v.createdAt).toLocaleDateString("en-GB");
        const r = v.readings[0];
        const chem = r
          ? `pH ${r.ph ?? "?"}, free chlorine ${r.chlorineFree ?? "?"} ppm, alkalinity ${r.alkalinity ?? "?"} ppm`
          : "no chemistry recorded";
        const status = v.completedAt ? "completed" : "in progress";
        lines.push(`- ${v.job?.pool?.name || "Pool"}: ${status} on ${date}. ${chem}.`);
      }
    }

    const unpaidCount = await prisma.invoice.count({
      where: { orgId, clientId: client.id, status: { in: ["sent", "overdue"] } },
    });
    if (unpaidCount > 0) lines.push("", `Unpaid invoices: ${unpaidCount}.`);

    return lines.join("\n");
  }

  async chat(
    orgId: string,
    userId: string,
    payload: { conversationId?: string; messages: ChatMessage[] }
  ): Promise<{ message: string; conversationId: string; title: string }> {
    const messages = payload.messages.filter((m) => m.role !== "system");
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content;
    if (!lastUserMsg) throw new BadRequestException("No message provided");

    const config = await this.settingsService.getLlmConfig(orgId);

    const fallbackMessage =
      "AI chat isn't set up for your account yet. For immediate help, tap 'Chat on WhatsApp' below or contact your service provider.";

    // Load or create conversation record
    let chat: { id: string; title: string; messages: ChatMessage[] } | null = null;
    if (payload.conversationId) {
      const existing = await prisma.clientChat.findFirst({
        where: { id: payload.conversationId, orgId, userId },
      });
      if (existing) {
        chat = {
          id: existing.id,
          title: existing.title,
          messages: (existing.messages as ChatMessage[]) || [],
        };
      }
    }

    const title =
      chat?.title ||
      (lastUserMsg.length > 50 ? lastUserMsg.slice(0, 47) + "..." : lastUserMsg);

    if (!config?.apiKey) {
      // Still persist the user message even if LLM not configured
      const newMessages: ChatMessage[] = [
        ...(chat?.messages || []),
        { role: "user", content: lastUserMsg },
        { role: "assistant", content: fallbackMessage },
      ];
      const saved = chat
        ? await prisma.clientChat.update({
            where: { id: chat.id },
            data: { messages: newMessages as any, updatedAt: new Date() },
          })
        : await prisma.clientChat.create({
            data: { orgId, userId, title, messages: newMessages as any },
          });
      return { message: fallbackMessage, conversationId: saved.id, title: saved.title };
    }

    const conversationHistory = chat ? chat.messages : messages.slice(0, -1);
    const context = await this.getClientContext(orgId, userId);
    const system = `${POOL_COACH_PERSONA}\n\n--- Client context ---\n${context}\n--- End context ---`;

    const fullMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: system },
      ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: lastUserMsg },
    ];

    const result = config.provider === "anthropic"
      ? await this.callAnthropic(config, fullMessages)
      : await this.callOpenAI(config, fullMessages);

    const newMessages: ChatMessage[] = [
      ...(chat?.messages || []),
      { role: "user", content: lastUserMsg },
      { role: "assistant", content: result.message },
    ];

    const saved = chat
      ? await prisma.clientChat.update({
          where: { id: chat.id },
          data: { messages: newMessages as any, updatedAt: new Date() },
        })
      : await prisma.clientChat.create({
          data: { orgId, userId, title, messages: newMessages as any },
        });

    return { message: result.message, conversationId: saved.id, title: saved.title };
  }

  async listChats(orgId: string, userId: string) {
    const chats = await prisma.clientChat.findMany({
      where: { orgId, userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return chats;
  }

  async getChat(orgId: string, userId: string, id: string) {
    const chat = await prisma.clientChat.findFirst({
      where: { id, orgId, userId },
    });
    if (!chat) throw new NotFoundException("Chat not found");
    return chat;
  }

  async deleteChat(orgId: string, userId: string, id: string) {
    const chat = await prisma.clientChat.findFirst({
      where: { id, orgId, userId },
    });
    if (!chat) throw new NotFoundException("Chat not found");
    await prisma.clientChat.delete({ where: { id } });
    return { success: true };
  }

  private async callAnthropic(
    config: { apiKey: string; model: string },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<{ message: string }> {
    const system = messages.find((m) => m.role === "system")?.content || "";
    const conversation = messages.filter((m) => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: config.model, max_tokens: 512, system, messages: conversation }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || "LLM error");
    return { message: data.content?.[0]?.text ?? "" };
  }

  private async callOpenAI(
    config: { apiKey: string; model: string; baseUrl: string | null },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<{ message: string }> {
    const base = ((config.baseUrl || "").trim() || "https://api.openai.com/v1").replace(/\/$/, "");

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, max_tokens: 512, messages }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(data.error?.message || "LLM error");
    return { message: data.choices?.[0]?.message?.content ?? "" };
  }
}
