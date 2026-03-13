import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SendMessageDto, LinkThreadDto, SuggestRepliesDto } from "./dto";
import { SmsAdapter } from "../notifications/adapters/sms.adapter";
import { EmailAdapter } from "../notifications/adapters/email.adapter";

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly smsAdapter: SmsAdapter,
    private readonly emailAdapter: EmailAdapter,
  ) {}

  async list(
    orgId: string,
    role: string,
    userId: string,
    filters: {
      folder?: string;
      clientId?: string;
      tag?: string;
      query?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.folder === "archived") {
      where.status = "archived";
    } else if (filters.folder === "unread") {
      where.unreadCount = { gt: 0 };
      where.status = "open";
    } else {
      where.status = "open";
    }

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.tag) {
      where.tags = { has: filters.tag };
    }

    // CLIENT can only see their own threads
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (client) {
        where.clientId = client.id;
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    // CARER can see threads linked to their jobs
    if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer) {
        where.links = {
          some: {
            targetType: "job",
            target: {
              assignedCarerId: carer.id,
            },
          },
        };
      } else {
        return { items: [], total: 0, page: filters.page, limit: filters.limit };
      }
    }

    const [items, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          client: {
            select: {
              id: true,
              name: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: {
              messages: true,
              links: true,
            },
          },
        },
        orderBy: { lastMessageAt: "desc" },
      }),
      prisma.thread.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async getOne(orgId: string, role: string, userId: string, threadId: string) {
    const thread = await prisma.thread.findFirst({
      where: {
        id: threadId,
        orgId,
      },
      include: {
        client: true,
        participants: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
        links: true,
      },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    // CLIENT can only see their own threads
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || thread.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    return thread;
  }

  async sendMessage(
    orgId: string,
    role: string,
    userId: string,
    threadId: string,
    dto: SendMessageDto
  ) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
      include: { client: true },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    // CLIENT can only send to their own threads
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || thread.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    // Determine sender role
    let senderRole = "manager";
    if (role === "CLIENT") {
      senderRole = "client";
    } else if (role === "CARER") {
      const carer = await prisma.carer.findFirst({
        where: { orgId, userId },
      });
      if (carer) senderRole = "carer";
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        orgId,
        threadId,
        senderRole,
        channel: thread.channelPrimary,
        text: dto.text,
        attachments: dto.attachments,
        meta: dto.meta,
      },
    });

    // Update thread
    await prisma.thread.update({
      where: { id: threadId },
      data: {
        lastMessageAt: new Date(),
        unreadCount: senderRole === "client" ? { increment: 1 } : 0,
      },
    });

    // Outbound delivery: only send externally when staff replies to a client
    if (senderRole !== "client" && thread.client) {
      await this.deliverOutbound(thread, dto.text, orgId).catch((err) => {
        this.logger.error(`Outbound delivery failed for thread ${threadId}: ${err.message}`);
        // Don't throw — message is saved; delivery failure is non-fatal
      });
    }

    return message;
  }

  /**
   * Deliver a message to the client via the thread's primary channel (SMS or email).
   */
  private async deliverOutbound(thread: any, text: string, orgId: string): Promise<void> {
    const client = thread.client;
    const channel = thread.channelPrimary; // whatsapp | sms | email | inapp

    if (channel === "sms" || channel === "whatsapp") {
      if (!client.phone) {
        this.logger.warn(`Cannot deliver SMS for thread ${thread.id}: client has no phone`);
        return;
      }
      await this.smsAdapter.send(client.phone, text, orgId);
      this.logger.log(`SMS sent to ${client.phone} for thread ${thread.id}`);
    } else if (channel === "email") {
      if (!client.email) {
        this.logger.warn(`Cannot deliver email for thread ${thread.id}: client has no email`);
        return;
      }
      const subject = thread.subject || "Message from your pool care team";
      await this.emailAdapter.send(client.email, subject, text, undefined, orgId);
      this.logger.log(`Email sent to ${client.email} for thread ${thread.id}`);
    } else {
      // inapp or unknown — no external delivery needed
      this.logger.debug(`Channel "${channel}" requires no external delivery`);
    }
  }

  async markRead(orgId: string, role: string, userId: string, threadId: string) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    await prisma.thread.update({
      where: { id: threadId },
      data: { unreadCount: 0 },
    });

    return { success: true };
  }

  async archive(orgId: string, threadId: string) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    return prisma.thread.update({
      where: { id: threadId },
      data: { status: "archived" },
    });
  }

  async unarchive(orgId: string, threadId: string) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    return prisma.thread.update({
      where: { id: threadId },
      data: { status: "open" },
    });
  }

  async linkThread(orgId: string, threadId: string, dto: LinkThreadDto) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    // Validate that the target entity exists and belongs to this org
    await this.validateLinkTarget(orgId, dto.targetType, dto.targetId);

    return prisma.threadLink.create({
      data: {
        orgId,
        threadId,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
    });
  }

  private async validateLinkTarget(orgId: string, targetType: string, targetId: string) {
    let found = false;
    switch (targetType) {
      case "pool":
        found = !!(await prisma.pool.findFirst({ where: { id: targetId, orgId } }));
        break;
      case "job":
        found = !!(await prisma.job.findFirst({ where: { id: targetId, orgId } }));
        break;
      case "visit":
        found = !!(await prisma.visit.findFirst({ where: { id: targetId, orgId } }));
        break;
      case "invoice":
        found = !!(await prisma.invoice.findFirst({ where: { id: targetId, orgId } }));
        break;
      case "quote":
        found = !!(await prisma.quote.findFirst({ where: { id: targetId, orgId } }));
        break;
      case "service_plan":
        found = !!(await prisma.servicePlan.findFirst({ where: { id: targetId, orgId } }));
        break;
      default:
        throw new BadRequestException(`Unknown targetType: ${targetType}`);
    }

    if (!found) {
      throw new NotFoundException(`${targetType} not found`);
    }
  }

  async getLinks(orgId: string, role: string, userId: string, threadId: string) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    // CLIENT can only see links for their own threads
    if (role === "CLIENT") {
      const client = await prisma.client.findFirst({
        where: { orgId, userId },
      });
      if (!client || thread.clientId !== client.id) {
        throw new ForbiddenException("Access denied");
      }
    }

    const links = await prisma.threadLink.findMany({
      where: { threadId },
    });

    // Enrich each link with a summary of the target entity
    return Promise.all(links.map((link) => this.enrichLink(link)));
  }

  private async enrichLink(link: { id: string; threadId: string; targetType: string; targetId: string; orgId: string }) {
    let entity: any = null;
    try {
      switch (link.targetType) {
        case "pool":
          entity = await prisma.pool.findUnique({
            where: { id: link.targetId },
            select: { id: true, name: true, type: true },
          });
          break;
        case "job":
          entity = await prisma.job.findUnique({
            where: { id: link.targetId },
            select: { id: true, scheduledDate: true, status: true },
          });
          break;
        case "visit":
          entity = await prisma.visit.findUnique({
            where: { id: link.targetId },
            select: { id: true, visitedAt: true, status: true },
          });
          break;
        case "invoice":
          entity = await prisma.invoice.findUnique({
            where: { id: link.targetId },
            select: { id: true, invoiceNumber: true, totalCents: true, status: true },
          });
          break;
        case "quote":
          entity = await prisma.quote.findUnique({
            where: { id: link.targetId },
            select: { id: true, totalCents: true, status: true },
          });
          break;
        case "service_plan":
          entity = await prisma.servicePlan.findUnique({
            where: { id: link.targetId },
            select: { id: true, status: true },
          });
          break;
      }
    } catch {
      // Entity may have been deleted; return link without enrichment
    }
    return { ...link, entity };
  }

  async suggestReplies(orgId: string, threadId: string, dto: SuggestRepliesDto) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
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

    // Context-aware suggestions based on recent messages
    const lastClientMessage = thread.messages.find((m) => m.senderRole === "client");
    const clientName = thread.client?.name || "there";

    const suggestions = [
      {
        text: `Hi ${clientName}, thank you for reaching out. How can I help you today?`,
        confidence: 0.7,
        intent: "greeting",
      },
      {
        text: "I'll look into this and get back to you shortly.",
        confidence: 0.8,
        intent: "follow_up",
      },
    ];

    // Add context-aware suggestions based on keywords
    if (lastClientMessage?.text) {
      const lower = lastClientMessage.text.toLowerCase();
      if (lower.includes("invoice") || lower.includes("payment") || lower.includes("bill")) {
        suggestions.unshift({
          text: `Hi ${clientName}, I can see your account details. Let me check on the invoice for you right away.`,
          confidence: 0.9,
          intent: "billing",
        });
      } else if (lower.includes("pool") || lower.includes("water") || lower.includes("chemical")) {
        suggestions.unshift({
          text: `Hi ${clientName}, I'll have our team check on your pool and get back to you with an update.`,
          confidence: 0.9,
          intent: "pool_issue",
        });
      } else if (lower.includes("schedule") || lower.includes("appointment") || lower.includes("visit")) {
        suggestions.unshift({
          text: `Hi ${clientName}, I'll arrange a visit at a convenient time for you. What dates work best?`,
          confidence: 0.9,
          intent: "scheduling",
        });
      }
    }

    return { suggestions: suggestions.slice(0, 3) };
  }

  // Webhook handler methods
  async handleInboundMessage(orgId: string | null, provider: string, payload: any) {
    const log = await prisma.channelWebhookLog.create({
      data: {
        orgId: orgId || undefined,
        provider,
        payload,
      },
    });

    try {
      const from = payload.from || payload.From || payload.sender;
      const text = payload.text || payload.Body || payload.message;

      if (!from || !text) {
        throw new BadRequestException("Missing from or text in payload");
      }

      const normalized = this.normalizeContact(from);

      let client = await prisma.client.findFirst({
        where: {
          orgId: orgId || undefined,
          OR: [
            ...(normalized.phone ? [{ phone: normalized.phone }] : []),
            ...(normalized.email ? [{ email: normalized.email }] : []),
          ],
        },
      });

      let resolvedOrgId = orgId;
      if (!resolvedOrgId && client) {
        resolvedOrgId = client.orgId;
      }

      if (!resolvedOrgId) {
        // Try to find org by phone number if no match
        await prisma.channelWebhookLog.update({
          where: { id: log.id },
          data: {
            processedAt: new Date(),
            error: "No orgId or client match — message tagged UNMATCHED",
          },
        });

        // Still create an unmatched thread so staff can see it
        const fallbackOrg = await prisma.organization.findFirst({ select: { id: true } });
        if (fallbackOrg) {
          const unmatched = await prisma.thread.create({
            data: {
              orgId: fallbackOrg.id,
              channelPrimary: provider,
              status: "open",
              tags: ["UNMATCHED"],
            },
          });
          await prisma.message.create({
            data: {
              orgId: fallbackOrg.id,
              threadId: unmatched.id,
              senderRole: "client",
              channel: provider,
              text,
              meta: { ...payload, _originalFrom: from },
            },
          });
        }

        return { success: false, reason: "unmatched" };
      }

      // Find or create open thread for this client+channel
      let thread = await prisma.thread.findFirst({
        where: {
          orgId: resolvedOrgId,
          clientId: client?.id,
          channelPrimary: provider,
          status: "open",
        },
        orderBy: { lastMessageAt: "desc" },
      });

      if (!thread) {
        thread = await prisma.thread.create({
          data: {
            orgId: resolvedOrgId,
            clientId: client?.id,
            channelPrimary: provider,
            status: "open",
            tags: client ? [] : ["UNMATCHED"],
          },
        });

        if (client?.userId) {
          await prisma.participant.create({
            data: {
              orgId: resolvedOrgId,
              threadId: thread.id,
              userId: client.userId,
              role: "client",
            },
          });
        }
      }

      await prisma.message.create({
        data: {
          orgId: resolvedOrgId,
          threadId: thread.id,
          senderRole: "client",
          channel: provider,
          text,
          meta: payload,
        },
      });

      await prisma.thread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(),
          unreadCount: { increment: 1 },
        },
      });

      await prisma.channelWebhookLog.update({
        where: { id: log.id },
        data: { processedAt: new Date() },
      });

      return { success: true, threadId: thread.id };
    } catch (error) {
      await prisma.channelWebhookLog.update({
        where: { id: log.id },
        data: {
          processedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private normalizeContact(contact: string): { phone?: string; email?: string } {
    if (contact.includes("@")) {
      return { email: contact.toLowerCase().trim() };
    }
    const phone = contact.replace(/[^\d+]/g, "");
    return { phone };
  }
}
