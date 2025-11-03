import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { SendMessageDto, LinkThreadDto, SuggestRepliesDto } from "./dto";

@Injectable()
export class InboxService {
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
        // Filter by threads linked to jobs assigned to this carer
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
        participants: {
          include: {
            // TODO: Include user details if userId present
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100, // Last 100 messages
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
      if (carer) {
        senderRole = "carer";
      }
    }

    // Create message
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

    // TODO: Send via appropriate channel adapter (WhatsApp, SMS, Email)
    // For now, just return the message
    return message;
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
      data: {
        unreadCount: 0,
      },
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

    const updated = await prisma.thread.update({
      where: { id: threadId },
      data: {
        status: "archived",
      },
    });

    return updated;
  }

  async unarchive(orgId: string, threadId: string) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    const updated = await prisma.thread.update({
      where: { id: threadId },
      data: {
        status: "open",
      },
    });

    return updated;
  }

  async linkThread(orgId: string, threadId: string, dto: LinkThreadDto) {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, orgId },
    });

    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    // Verify target exists and belongs to org
    // TODO: Validate targetType and targetId against actual entities

    const link = await prisma.threadLink.create({
      data: {
        orgId,
        threadId,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
    });

    return link;
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

    // TODO: Enrich with actual entity data (job details, invoice, etc.)
    return links;
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

    // TODO: Integrate with AI service for intent classification and reply generation
    // For now, return placeholder suggestions
    const suggestions = [
      {
        text: `Hi ${thread.client?.name || "there"}, thank you for reaching out. How can I help you today?`,
        confidence: 0.7,
        intent: "general",
      },
      {
        text: "I'll look into this and get back to you shortly.",
        confidence: 0.8,
        intent: "follow_up",
      },
    ];

    return { suggestions };
  }

  // Webhook handler methods
  async handleInboundMessage(
    orgId: string | null,
    provider: string,
    payload: any
  ) {
    // Log webhook
    const log = await prisma.channelWebhookLog.create({
      data: {
        orgId: orgId || undefined,
        provider,
        payload,
      },
    });

    try {
      // Extract phone/email from payload
      const from = payload.from || payload.From || payload.sender;
      const text = payload.text || payload.Body || payload.message;

      if (!from || !text) {
        throw new Error("Missing from or text in payload");
      }

      // Normalize phone/email
      const normalized = this.normalizeContact(from);

      // Find or create client by contact
      let client = await prisma.client.findFirst({
        where: {
          orgId: orgId || undefined,
          OR: [
            { phone: normalized.phone },
            { email: normalized.email },
          ],
        },
      });

      // If orgId not set, try to infer from client
      let resolvedOrgId = orgId;
      if (!resolvedOrgId && client) {
        resolvedOrgId = client.orgId;
      }

      if (!resolvedOrgId) {
        // Unmatched message - create unassigned thread
        // TODO: Handle unmatched messages
        await prisma.channelWebhookLog.update({
          where: { id: log.id },
          data: {
            processedAt: new Date(),
            error: "No orgId or client match",
          },
        });
        return { success: false, reason: "unmatched" };
      }

      // Find or create thread
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

        // Add client as participant
        if (client) {
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

      // Create message
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

      // Update thread
      await prisma.thread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(),
          unreadCount: { increment: 1 },
        },
      });

      await prisma.channelWebhookLog.update({
        where: { id: log.id },
        data: {
          processedAt: new Date(),
        },
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
    // Simple normalization - phone if starts with + or digits, email if contains @
    if (contact.includes("@")) {
      return { email: contact.toLowerCase().trim() };
    }

    // Remove non-digits except +
    const phone = contact.replace(/[^\d+]/g, "");
    return { phone };
  }
}

