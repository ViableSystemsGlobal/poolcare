import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SuggestRepliesDto } from "../dto";

@Injectable()
export class SmartRepliesService {
  async suggest(orgId: string, threadId: string, dto: SuggestRepliesDto) {
    const thread = await prisma.thread.findFirst({
      where: {
        id: threadId,
        orgId,
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        client: true,
        links: true,
      },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    // Get last few messages for context
    const recentMessages = thread.messages
      .filter((m) => m.senderRole === "client")
      .slice(0, 5)
      .map((m) => m.text)
      .join(" ");

    // Classify intent (simplified - in production would use AI model)
    const intent = this.classifyIntent(recentMessages);

    // Generate suggestions based on intent and thread context
    const suggestions = this.generateReplies(intent, thread);

    return {
      suggestions,
      intent,
      confidence: 0.8, // Placeholder
    };
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

    // Find linked invoice, quote, or job
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

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }
}

