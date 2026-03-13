import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SettingsService } from "../../settings/settings.service";
import { SuggestRepliesDto } from "../dto";

@Injectable()
export class SmartRepliesService {
  constructor(private readonly settingsService: SettingsService) {}

  async suggest(orgId: string, threadId: string, dto: SuggestRepliesDto) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 10 },
        client: true,
        links: true,
      },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    const config = await this.settingsService.getLlmConfig(orgId);
    if (config?.apiKey) {
      try {
        return await this.suggestWithLlm(orgId, thread, config);
      } catch {
        // Fall through to rule-based
      }
    }

    return this.suggestRuleBased(thread);
  }

  private async suggestWithLlm(orgId: string, thread: any, config: any) {
    const clientName = thread.client?.name || "the client";
    const recentMessages = [...thread.messages]
      .reverse()
      .slice(-6)
      .map((m: any) => `[${m.senderRole}]: ${m.text}`)
      .join("\n");

    const links = thread.links || [];
    const linkContext = links.length > 0
      ? links.map((l: any) => `Linked ${l.targetType}: ${l.targetId}`).join(", ")
      : "No linked records";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    const prompt = `You are a helpful assistant for a pool care company. Generate 2-3 short, professional reply suggestions for the following customer conversation thread.

Client name: ${clientName}
Thread channel: ${thread.channelPrimary || "message"}
Linked records: ${linkContext}

Recent messages:
${recentMessages}

Rules:
- Keep each reply under 40 words
- Be warm, professional, and action-oriented
- If there is a linked invoice/quote/job, include its URL (base: ${appUrl})
- Return ONLY a JSON array (no markdown) like:
[{"text": "...", "confidence": 0.9}, {"text": "...", "confidence": 0.8}]`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "user", content: prompt },
    ];

    const raw =
      config.provider === "anthropic"
        ? await this.callAnthropic(config, messages)
        : await this.callOpenAI(config, messages);

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");

    const suggestions = JSON.parse(jsonMatch[0]).slice(0, 3);
    const recentText = thread.messages
      .filter((m: any) => m.senderRole === "client")
      .slice(0, 5)
      .map((m: any) => m.text)
      .join(" ");

    return {
      suggestions,
      intent: this.classifyIntent(recentText),
      confidence: 0.9,
    };
  }

  private suggestRuleBased(thread: any) {
    const recentMessages = thread.messages
      .filter((m: any) => m.senderRole === "client")
      .slice(0, 5)
      .map((m: any) => m.text)
      .join(" ");

    const intent = this.classifyIntent(recentMessages);
    const suggestions = this.generateReplies(intent, thread);

    return { suggestions, intent, confidence: 0.8 };
  }

  private classifyIntent(text: string): string {
    const lower = text.toLowerCase();

    if (lower.includes("reschedule") || lower.includes("move") || lower.includes("change time")) {
      return "reschedule";
    }
    if (lower.includes("invoice") || lower.includes("bill") || lower.includes("payment") || lower.includes("pay")) {
      return "billing";
    }
    if (lower.includes("quote") || lower.includes("approve") || lower.includes("price")) {
      return "quote";
    }
    if (lower.includes("problem") || lower.includes("issue") || lower.includes("broken") || lower.includes("not working")) {
      return "issue";
    }
    if (lower.includes("thank") || lower.includes("thanks") || lower.includes("great") || lower.includes("good")) {
      return "feedback";
    }
    return "general";
  }

  private generateReplies(intent: string, thread: any): any[] {
    const clientName = thread.client?.name || "there";
    const suggestions: any[] = [];

    const invoiceLink = thread.links?.find((l: any) => l.targetType === "invoice");
    const quoteLink = thread.links?.find((l: any) => l.targetType === "quote");
    const jobLink = thread.links?.find((l: any) => l.targetType === "job");

    switch (intent) {
      case "reschedule":
        suggestions.push({
          text: `Hi ${clientName}, I'd be happy to help reschedule your service. Let me know your preferred date and time, and I'll check availability.`,
          confidence: 0.9,
        });
        if (jobLink) {
          suggestions.push({
            text: `Hi ${clientName}, I can help reschedule your visit. Click here to choose a new time: ${process.env.NEXT_PUBLIC_APP_URL}/jobs/${jobLink.targetId}/reschedule`,
            confidence: 0.85,
            includesLink: true,
          });
        }
        break;

      case "billing":
        if (invoiceLink) {
          suggestions.push({
            text: `Hi ${clientName}, here's your invoice link: ${process.env.NEXT_PUBLIC_APP_URL}/invoices/${invoiceLink.targetId}. You can pay directly from there.`,
            confidence: 0.9,
            includesLink: true,
          });
        } else {
          suggestions.push({
            text: `Hi ${clientName}, I'll look up your invoice and send you the details shortly.`,
            confidence: 0.8,
          });
        }
        suggestions.push({
          text: `Hi ${clientName}, your account balance is up to date. If you have questions about a specific invoice, let me know the invoice number.`,
          confidence: 0.7,
        });
        break;

      case "quote":
        if (quoteLink) {
          suggestions.push({
            text: `Hi ${clientName}, here's your quote: ${process.env.NEXT_PUBLIC_APP_URL}/quotes/${quoteLink.targetId}. Please review and let me know if you'd like to approve or if you have questions.`,
            confidence: 0.9,
            includesLink: true,
          });
        } else {
          suggestions.push({
            text: `Hi ${clientName}, I'll prepare a quote for you and send it shortly.`,
            confidence: 0.8,
          });
        }
        break;

      case "issue":
        suggestions.push({
          text: `Hi ${clientName}, I'm sorry to hear about the issue. Let me create a service request for you right away. Can you describe what's happening in more detail?`,
          confidence: 0.85,
        });
        suggestions.push({
          text: `Hi ${clientName}, I'll dispatch a technician to assess the situation. I'll update you once I have a schedule.`,
          confidence: 0.8,
        });
        break;

      case "feedback":
        suggestions.push({
          text: `Thank you, ${clientName}! We really appreciate your feedback. Is there anything else we can help you with?`,
          confidence: 0.9,
        });
        break;

      default:
        suggestions.push({
          text: `Hi ${clientName}, thank you for reaching out. How can I assist you today?`,
          confidence: 0.8,
        });
        suggestions.push({
          text: `Hi ${clientName}, I'm here to help. Let me know what you need, and I'll take care of it right away.`,
          confidence: 0.75,
        });
    }

    return suggestions.slice(0, 3);
  }

  private async callAnthropic(
    config: { apiKey: string; model: string },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<string> {
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
    if (!res.ok) throw new Error(data.error?.message || "LLM error");
    return data.content?.[0]?.text ?? "";
  }

  private async callOpenAI(
    config: { apiKey: string; model: string; baseUrl: string | null },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<string> {
    const base = ((config.baseUrl || "").trim() || "https://api.openai.com/v1").replace(/\/$/, "");

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, max_tokens: 512, messages }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(data.error?.message || "LLM error");
    return data.choices?.[0]?.message?.content ?? "";
  }
}
