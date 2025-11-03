import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { SmsAdapter } from "./adapters/sms.adapter";
import { SendNotificationDto } from "./dto";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly smsAdapter: SmsAdapter
  ) {}

  async send(orgId: string, dto: SendNotificationDto) {
    // Create notification record
    const notification = await prisma.notification.create({
      data: {
        orgId,
        recipientId: dto.recipientId,
        recipientType: dto.recipientType || "user",
        channel: dto.channel,
        template: dto.template,
        subject: dto.subject,
        body: dto.body,
        status: "pending",
        metadata: dto.metadata,
      },
    });

    // Send via appropriate adapter
    try {
      let providerRef: string | undefined;

      if (dto.channel === "sms") {
        providerRef = await this.smsAdapter.send(dto.to, dto.body, orgId);
      } else if (dto.channel === "email") {
        // TODO: Email adapter
        console.log(`[EMAIL] To: ${dto.to}, Subject: ${dto.subject}, Body: ${dto.body}`);
      } else if (dto.channel === "push") {
        // TODO: Push notification adapter
        console.log(`[PUSH] To: ${dto.to}, Body: ${dto.body}`);
      }

      // Update notification status
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "sent",
          providerRef,
          sentAt: new Date(),
        },
      });

      return notification;
    } catch (error) {
      // Mark as failed
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "failed",
          metadata: { error: error instanceof Error ? error.message : String(error) },
        },
      });

      throw error;
    }
  }

  async schedule(orgId: string, dto: SendNotificationDto & { scheduledFor: string }) {
    const notification = await prisma.notification.create({
      data: {
        orgId,
        recipientId: dto.recipientId,
        recipientType: dto.recipientType || "user",
        channel: dto.channel,
        template: dto.template,
        subject: dto.subject,
        body: dto.body,
        status: "pending",
        scheduledFor: new Date(dto.scheduledFor),
        metadata: dto.metadata,
      },
    });

    // TODO: Queue in BullMQ for scheduled delivery
    return notification;
  }

  async list(
    orgId: string,
    filters: {
      recipientId?: string;
      channel?: string;
      status?: string;
      page: number;
      limit: number;
    }
  ) {
    const where: any = { orgId };

    if (filters.recipientId) {
      where.recipientId = filters.recipientId;
    }

    if (filters.channel) {
      where.channel = filters.channel;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  // Helper methods for common notification scenarios
  async notifyJobReminder(carerId: string, jobId: string, orgId: string) {
    const carer = await prisma.carer.findFirst({
      where: { id: carerId, orgId },
    });

    if (!carer || !carer.phone) {
      return;
    }

    // TODO: Fetch job details and format message
    const message = `Reminder: You have a job scheduled today. Check your app for details.`;

    return this.send(orgId, {
      recipientId: carer.userId,
      recipientType: "carer",
      channel: "sms",
      body: message,
      to: carer.phone,
      template: "job_reminder",
      metadata: { jobId },
    });
  }

  async notifyVisitComplete(clientId: string, visitId: string, orgId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      return;
    }

    const channel = client.preferredChannel || "WHATSAPP";
    const phone = client.phone;

    if (!phone) {
      return;
    }

    // TODO: Format message with visit details and report link
    const message = `Your pool service visit is complete! View your report: ${process.env.NEXT_PUBLIC_APP_URL}/visits/${visitId}`;

    return this.send(orgId, {
      recipientId: client.userId,
      recipientType: "client",
      channel: channel === "WHATSAPP" ? "whatsapp" : "sms",
      body: message,
      to: phone,
      template: "visit_complete",
      metadata: { visitId },
    });
  }

  async notifyQuoteReady(clientId: string, quoteId: string, orgId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      return;
    }

    const channel = client.preferredChannel || "WHATSAPP";
    const phone = client.phone;

    if (!phone) {
      return;
    }

    const message = `A new quote is ready for your review. View and approve: ${process.env.NEXT_PUBLIC_APP_URL}/quotes/${quoteId}`;

    return this.send(orgId, {
      recipientId: client.userId,
      recipientType: "client",
      channel: channel === "WHATSAPP" ? "whatsapp" : "sms",
      body: message,
      to: phone,
      template: "quote_ready",
      metadata: { quoteId },
    });
  }
}

