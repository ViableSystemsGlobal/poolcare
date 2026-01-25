import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import { SmsAdapter } from "./adapters/sms.adapter";
import { EmailAdapter } from "./adapters/email.adapter";
import { PushAdapter } from "./adapters/push.adapter";
import { SendNotificationDto } from "./dto";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly smsAdapter: SmsAdapter,
    private readonly emailAdapter: EmailAdapter,
    private readonly pushAdapter: PushAdapter
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
        const subject = dto.subject || dto.template || "PoolCare Notification";
        const html =
          dto.metadata && typeof dto.metadata === "object" && typeof dto.metadata.html === "string"
            ? dto.metadata.html
            : undefined;

        providerRef = await this.emailAdapter.send(dto.to, subject, dto.body, html, orgId);
      } else if (dto.channel === "push") {
        // Push notifications require device tokens
        // If 'to' is a device token, send directly
        // Otherwise, if recipientId is provided, fetch tokens for that user
        if (dto.to && dto.to.startsWith("ExponentPushToken") || dto.to.startsWith("ExpoPushToken")) {
          // Direct device token
          providerRef = await this.pushAdapter.send(
            dto.to,
            dto.subject || dto.template || "PoolCare Notification",
            dto.body,
            dto.metadata as Record<string, any>
          );
        } else if (dto.recipientId) {
          // Send to user by fetching their device tokens
          const results = await this.pushAdapter.sendToUser(
            dto.recipientId,
            orgId,
            dto.subject || dto.template || "PoolCare Notification",
            dto.body,
            dto.metadata as Record<string, any>
          );
          providerRef = results.length > 0 ? results[0] : undefined;
        } else {
          throw new Error("Push notifications require either a device token or recipientId");
        }
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
      include: {
        user: true,
      },
    });

    if (!carer) {
      return;
    }

    // Fetch job details
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      include: {
        pool: {
          include: {
            client: true,
          },
        },
      },
    });

    const poolName = job?.pool?.name || job?.pool?.address || "pool";
    const windowStart = job?.windowStart
      ? new Date(job.windowStart).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    const message = `Reminder: You have a job at ${poolName}${windowStart ? ` at ${windowStart}` : ""} today. Check your app for details.`;

    // Try push notification first (if user has device tokens)
    if (carer.userId) {
      try {
        await this.pushAdapter.sendToCarer(
          carerId,
          orgId,
          "Job Reminder",
          message,
          { jobId, type: "job_reminder" }
        );
      } catch (error) {
        // Fallback to SMS if push fails
        if (carer.phone) {
          await this.send(orgId, {
      recipientId: carer.userId,
      recipientType: "carer",
      channel: "sms",
      body: message,
      to: carer.phone,
      template: "job_reminder",
      metadata: { jobId },
    });
        }
      }
    } else if (carer.phone) {
      // Fallback to SMS if no userId
      return this.send(orgId, {
        recipientId: carerId,
        recipientType: "carer",
        channel: "sms",
        body: message,
        to: carer.phone,
        template: "job_reminder",
        metadata: { jobId },
      });
    }
  }

  async notifyVisitComplete(clientId: string, visitId: string, orgId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      return;
    }

    const appUrl =
      this.configService.get<string>("APP_URL") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      this.configService.get<string>("NEXT_PUBLIC_APP_URL") ||
      "";
    const message = `Your pool service visit is complete! View your report: ${appUrl}/visits/${visitId}`;

    // Try push notification first (if user has device tokens)
    if (client.userId) {
      try {
        await this.pushAdapter.sendToClient(
          clientId,
          orgId,
          "Visit Complete",
          "Your pool service visit is complete! Tap to view your report.",
          { visitId, type: "visit_complete", url: `${appUrl}/visits/${visitId}` }
        );
      } catch (error) {
        // Fallback to preferred channel if push fails
      }
    }

    // Also send via preferred channel
    const preferredChannel = (client.preferredChannel || "WHATSAPP").toLowerCase();

    if (preferredChannel === "email" && client.email) {
      return this.send(orgId, {
        recipientId: client.userId,
        recipientType: "client",
        channel: "email",
        to: client.email,
        subject: "Your Pool Service Visit Report is Ready",
        body: message,
        template: "visit_complete",
        metadata: {
          visitId,
          html: `<p>Your pool service visit is complete!</p><p><a href="${appUrl}/visits/${visitId}">View your report</a></p>`,
        },
      });
    }

    const phone = client.phone;
    if (!phone) {
      return;
    }

    const channel = preferredChannel === "whatsapp" ? "whatsapp" : "sms";

    return this.send(orgId, {
      recipientId: client.userId,
      recipientType: "client",
      channel,
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

    const appUrl =
      this.configService.get<string>("APP_URL") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      this.configService.get<string>("NEXT_PUBLIC_APP_URL") ||
      "";
    const message = `A new quote is ready for your review. View and approve: ${appUrl}/quotes/${quoteId}`;

    // Try push notification first (if user has device tokens)
    if (client.userId) {
      try {
        await this.pushAdapter.sendToClient(
          clientId,
          orgId,
          "New Quote Ready",
          "A new quote is ready for your review. Tap to view and approve.",
          { quoteId, type: "quote_ready", url: `${appUrl}/quotes/${quoteId}` }
        );
      } catch (error) {
        // Fallback to preferred channel if push fails
      }
    }

    // Also send via preferred channel
    const preferredChannel = (client.preferredChannel || "WHATSAPP").toLowerCase();

    if (preferredChannel === "email" && client.email) {
      // Get org settings for email template
      const orgSettings = await getOrgEmailSettings(orgId);
      
      const emailContent = `
        <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">New Quote Ready for Approval</h2>
        <p style="margin: 0 0 16px 0;">A new quote is ready for your review.</p>
        <p style="margin: 16px 0;">
          <a href="${appUrl}/quotes/${quoteId}" style="background-color: ${orgSettings.primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View and Approve Quote
          </a>
        </p>
        <p style="margin: 16px 0 0 0; color: #666; font-size: 14px;">
          You can review the quote details and approve it directly from the link above.
        </p>
      `;
      
      const emailHtml = createEmailTemplate(emailContent, orgSettings);
      
      return this.send(orgId, {
        recipientId: client.userId,
        recipientType: "client",
        channel: "email",
        to: client.email,
        subject: "New Quote Ready for Approval",
        body: message,
        template: "quote_ready",
        metadata: {
          quoteId,
          html: emailHtml,
        },
      });
    }

    const phone = client.phone;
    if (!phone) {
      return;
    }

    const channel = preferredChannel === "whatsapp" ? "whatsapp" : "sms";

    return this.send(orgId, {
      recipientId: client.userId,
      recipientType: "client",
      channel,
      body: message,
      to: phone,
      template: "quote_ready",
      metadata: { quoteId },
    });
  }
}

