import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";

interface ExpoPushMessage {
  to: string | string[];
  sound?: "default";
  title?: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

interface ExpoPushResponse {
  data: Array<{
    status: "ok" | "error";
    id?: string;
    message?: string;
    details?: {
      error?: string;
      [key: string]: any;
    };
  }>;
}

@Injectable()
export class PushAdapter {
  private readonly logger = new Logger(PushAdapter.name);
  private readonly expoApiUrl = "https://exp.host/--/api/v2/push/send";

  constructor(private readonly configService: ConfigService) {}

  /**
   * Send push notification to a single device token
   */
  async send(
    token: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    orgId?: string
  ): Promise<string> {
    return this.sendBulk([{ token, title, body, data }], orgId).then(
      (results) => results[0]
    );
  }

  /**
   * Send push notifications to multiple device tokens
   */
  async sendBulk(
    messages: Array<{
      token: string;
      title: string;
      body: string;
      data?: Record<string, any>;
      sound?: "default";
      badge?: number;
      priority?: "default" | "normal" | "high";
    }>,
    orgId?: string
  ): Promise<string[]> {
    if (messages.length === 0) {
      return [];
    }

    // Prepare Expo push messages
    const expoMessages: ExpoPushMessage[] = messages.map((msg) => ({
      to: msg.token,
      sound: msg.sound || "default",
      title: msg.title,
      body: msg.body,
      data: msg.data,
      priority: msg.priority || "default",
    }));

    try {
      const response = await fetch(this.expoApiUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(expoMessages),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Expo Push API HTTP error: ${response.status} - ${errorText}`
        );
        throw new InternalServerErrorException(`Expo Push API HTTP error: ${response.status}`);
      }

      const result = await response.json() as ExpoPushResponse;

      // Process results and handle errors
      const messageIds: string[] = [];
      if (!result.data || result.data.length === 0) {
        this.logger.warn("Expo Push API returned no data");
        return messageIds;
      }
      for (let i = 0; i < result.data.length; i++) {
        const item = result.data[i];
        if (item.status === "ok" && item.id) {
          messageIds.push(item.id);
          this.logger.log(
            `Push notification sent successfully: ${item.id}`
          );
        } else {
          const errorMsg = item.details?.error || item.message || "Unknown error";
          this.logger.error(
            `Failed to send push notification to token ${messages[i].token}: ${errorMsg}`
          );

          // Handle invalid device tokens (remove from database)
          if (
            errorMsg.includes("DeviceNotRegistered") ||
            errorMsg.includes("InvalidCredentials") ||
            errorMsg.includes("InvalidToken")
          ) {
            await this.handleInvalidToken(messages[i].token);
          }

          messageIds.push(`failed_${messages[i].token}`);
        }
      }

      return messageIds;
    } catch (error: any) {
      this.logger.error(`Failed to send push notifications:`, error.message);

      // In development, log instead of failing
      if (this.configService.get<string>("NODE_ENV") === "development") {
        this.logger.warn(
          `[Dev Mode] Push notifications would be sent: ${JSON.stringify(
            messages.map((m) => ({ token: m.token.substring(0, 20) + "...", title: m.title }))
          )}`
        );
        return messages.map(() => `dev_ref_${Date.now()}`);
      }

      throw error;
    }
  }

  /**
   * Send push notification to a user (fetches all their device tokens)
   */
  async sendToUser(
    userId: string,
    orgId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    // When set, only send to device tokens belonging to that app. A single
    // person can have BOTH the carer and client apps (or be both a carer and a
    // client), so an unscoped userId lookup can deliver a client push to the
    // carer app and vice versa. Pass the role to keep pushes on the right app.
    appRole?: "carer" | "client"
  ): Promise<string[]> {
    const where: any = {
      userId,
      orgId,
      platform: { in: ["ios", "android"] }, // Only mobile platforms
    };
    if (appRole === "carer") where.carerId = { not: null };
    else if (appRole === "client") where.clientId = { not: null };

    const deviceTokens = await prisma.deviceToken.findMany({ where });

    if (deviceTokens.length === 0) {
      this.logger.warn(
        `No device tokens found for user ${userId} in org ${orgId}${appRole ? ` (${appRole} app)` : ""}`
      );
      return [];
    }

    const messages = deviceTokens.map((dt) => ({
      token: dt.token,
      title,
      body,
      data,
    }));

    return this.sendBulk(messages, orgId);
  }

  /**
   * Send push notification to a carer — only to CARER-app device tokens.
   */
  async sendToCarer(
    carerId: string,
    orgId: string,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<string[]> {
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { carerId, orgId, platform: { in: ["ios", "android"] } },
    });

    if (deviceTokens.length === 0) {
      this.logger.warn(`No carer-app device tokens for carer ${carerId} in org ${orgId}`);
      return [];
    }

    return this.sendBulk(
      deviceTokens.map((dt) => ({ token: dt.token, title, body, data })),
      orgId
    );
  }

  /**
   * Send push notification to a client — only to CLIENT-app device tokens.
   */
  async sendToClient(
    clientId: string,
    orgId: string,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<string[]> {
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { clientId, orgId, platform: { in: ["ios", "android"] } },
    });

    if (deviceTokens.length === 0) {
      this.logger.warn(`No client-app device tokens for client ${clientId} in org ${orgId}`);
      return [];
    }

    return this.sendBulk(
      deviceTokens.map((dt) => ({ token: dt.token, title, body, data })),
      orgId
    );
  }

  /**
   * Broadcast push notification to all devices in an org (clients, carers, or both)
   */
  async broadcastToOrg(
    orgId: string,
    title: string,
    body: string,
    audience: "all" | "clients" | "carers",
    data?: Record<string, any>
  ): Promise<{ sent: number; failed: number; total: number }> {
    // Collect userIds based on audience
    const userIdSet = new Set<string>();

    if (audience === "clients" || audience === "all") {
      const clients = await prisma.client.findMany({
        where: { orgId, userId: { not: null } },
        select: { userId: true },
      });
      clients.forEach((c) => c.userId && userIdSet.add(c.userId));
    }

    if (audience === "carers" || audience === "all") {
      const carers = await prisma.carer.findMany({
        where: { orgId, userId: { not: null } },
        select: { userId: true },
      });
      carers.forEach((c) => c.userId && userIdSet.add(c.userId));
    }

    if (userIdSet.size === 0) {
      return { sent: 0, failed: 0, total: 0 };
    }

    const tokenWhere: any = {
      orgId,
      userId: { in: Array.from(userIdSet) },
      platform: { in: ["ios", "android"] },
    };
    // Keep a carers-only broadcast on the carer app and a clients-only
    // broadcast on the client app, even when one person has both apps.
    if (audience === "carers") tokenWhere.carerId = { not: null };
    else if (audience === "clients") tokenWhere.clientId = { not: null };

    const deviceTokens = await prisma.deviceToken.findMany({ where: tokenWhere });

    if (deviceTokens.length === 0) {
      return { sent: 0, failed: 0, total: 0 };
    }

    const messages = deviceTokens.map((dt) => ({ token: dt.token, title, body, data }));
    const results = await this.sendBulk(messages, orgId);

    const failed = results.filter((r) => r.startsWith("failed_")).length;
    return { sent: results.length - failed, failed, total: deviceTokens.length };
  }

  /**
   * Handle invalid device tokens by removing them from the database
   */
  private async handleInvalidToken(token: string): Promise<void> {
    try {
      const deleted = await prisma.deviceToken.deleteMany({
        where: { token },
      });

      if (deleted.count > 0) {
        this.logger.log(
          `Removed invalid device token: ${token.substring(0, 20)}...`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to remove invalid device token: ${error.message}`
      );
    }
  }
}

