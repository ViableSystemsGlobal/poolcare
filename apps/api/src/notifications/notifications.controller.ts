import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { createWelcomeEmailTemplate } from "../email/email-template.util";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SendNotificationDto } from "./dto";
import { prisma } from "@poolcare/db";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("recipientId") recipientId?: string,
    @Query("channel") channel?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.notificationsService.list(user.org_id, {
      recipientId,
      channel,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get("device-tokens")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async deviceTokens(
    @CurrentUser() user: { org_id: string }
  ) {
    const tokens = await prisma.deviceToken.findMany({
      where: { orgId: user.org_id },
      select: { userId: true, platform: true, createdAt: true },
    });
    return { items: tokens };
  }

  /** Detailed app-user profile: user + client/carer link, devices, notification history. */
  @Get("app-users/:userId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async appUserProfile(
    @CurrentUser() user: { org_id: string },
    @Param("userId") userId: string,
    @Query("notifPage") notifPage?: string,
    @Query("notifLimit") notifLimit?: string
  ) {
    const nPage = Math.max(1, parseInt(notifPage || "1", 10) || 1);
    const nLimit = Math.min(50, Math.max(1, parseInt(notifLimit || "10", 10) || 10));
    const orgId = user.org_id;
    // The id may be a User id, or a Client/Carer record id (clients without app accounts)
    const [client, carer] = await Promise.all([
      prisma.client.findFirst({
        where: { orgId, OR: [{ userId }, { id: userId }] },
        select: {
          id: true, userId: true, householdId: true, name: true, email: true, phone: true, createdAt: true,
          _count: { select: { pools: true } },
        },
      }),
      prisma.carer.findFirst({
        where: { orgId, OR: [{ userId }, { id: userId }] },
        select: { id: true, userId: true, name: true, phone: true, active: true, lastLocationUpdate: true, createdAt: true },
      }),
    ]);

    const resolvedUserId = client?.userId || carer?.userId || userId;
    // Only surface the User record when it belongs to THIS org — either linked
    // via an org-scoped client/carer above, or a direct OrgMember. Prevents an
    // admin of one org reading another tenant's users by guessing their id.
    const belongsToOrg = !!client || !!carer || (resolvedUserId
      ? !!(await prisma.orgMember.findFirst({ where: { orgId, userId: resolvedUserId }, select: { id: true } }))
      : false);
    const record = belongsToOrg
      ? await prisma.user.findUnique({
          where: { id: resolvedUserId },
          select: { id: true, name: true, email: true, phone: true, imageUrl: true, createdAt: true },
        })
      : null;

    if (!record && !client && !carer) {
      throw new NotFoundException("App user not found");
    }

    const devices = await prisma.deviceToken.findMany({
      where: {
        orgId,
        OR: [
          { userId: resolvedUserId },
          ...(client ? [{ clientId: client.id }] : []),
          ...(carer ? [{ carerId: carer.id }] : []),
        ],
      },
      select: { platform: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Notifications may be keyed by user id or the client/carer record id
    const recipientIds = [...new Set([userId, resolvedUserId, client?.id, carer?.id].filter(Boolean))] as string[];
    const [notifications, notificationsTotal] = await Promise.all([
      prisma.notification.findMany({
        where: { orgId, recipientId: { in: recipientIds } },
        orderBy: { createdAt: "desc" },
        skip: (nPage - 1) * nLimit,
        take: nLimit,
        select: {
          id: true, channel: true, subject: true, body: true,
          status: true, sentAt: true, createdAt: true,
        },
      }),
      prisma.notification.count({ where: { orgId, recipientId: { in: recipientIds } } }),
    ]);

    // Household (clients only): the one they belong to, or the one they lead
    let household: any = null;
    if (client) {
      household = await prisma.household.findFirst({
        where: {
          orgId,
          OR: [
            { primaryClientId: client.id },
            ...(client.householdId ? [{ id: client.householdId }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          primaryClientId: true,
          primaryClient: { select: { id: true, name: true, email: true, phone: true } },
          members: { select: { id: true, name: true, email: true, phone: true } },
        },
      });
    }

    // App issues: on the client's pools, or reported by the carer
    let issues: any[] = [];
    let openIssues = 0;
    const issueWhere = client
      ? { orgId, pool: { clientId: client.id } }
      : carer?.userId
        ? { orgId, createdBy: carer.userId }
        : null;
    if (issueWhere) {
      [issues, openIssues] = await Promise.all([
        prisma.issue.findMany({
          where: issueWhere,
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true, type: true, severity: true, status: true, description: true, createdAt: true,
            pool: { select: { id: true, name: true, address: true } },
          },
        }),
        prisma.issue.count({
          where: { ...issueWhere, status: { in: ["open", "quoted", "scheduled"] } },
        }),
      ]);
    }

    let carerStats: { jobsCompleted: number; jobsUpcoming: number } | null = null;
    if (carer) {
      const now = new Date();
      const [jobsCompleted, jobsUpcoming] = await Promise.all([
        prisma.job.count({ where: { orgId, assignedCarerId: carer.id, status: "completed" } }),
        prisma.job.count({
          where: {
            orgId, assignedCarerId: carer.id,
            status: { notIn: ["completed", "cancelled"] },
            windowStart: { gte: now },
          },
        }),
      ]);
      carerStats = { jobsCompleted, jobsUpcoming };
    }

    return {
      user: record,
      role: client ? "Client" : carer ? "Carer" : null,
      client: client
        ? { id: client.id, name: client.name, email: client.email, phone: client.phone, createdAt: client.createdAt, poolsCount: client._count.pools }
        : null,
      carer: carer ? { ...carer, ...carerStats } : null,
      household,
      issues,
      devices,
      notifications,
      notificationsPage: { page: nPage, limit: nLimit, total: notificationsTotal },
      stats: { notificationsTotal, openIssues },
    };
  }

  /** Re-send the account welcome email (app download instructions etc.). */
  @Post("app-users/:userId/welcome-email")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async sendAppUserWelcomeEmail(
    @CurrentUser() user: { org_id: string },
    @Param("userId") userId: string
  ) {
    const orgId = user.org_id;
    const [client, carer] = await Promise.all([
      prisma.client.findFirst({
        where: { orgId, OR: [{ userId }, { id: userId }] },
        select: { id: true, userId: true, name: true, email: true },
      }),
      prisma.carer.findFirst({
        where: { orgId, OR: [{ userId }, { id: userId }] },
        select: { id: true, userId: true, name: true },
      }),
    ]);
    const resolvedUserId = client?.userId || carer?.userId || userId;
    // Only resolve the User when it belongs to THIS org (via client/carer or an
    // OrgMember) so we can't email a user from another tenant.
    const belongsToOrg = !!client || !!carer || (resolvedUserId
      ? !!(await prisma.orgMember.findFirst({ where: { orgId, userId: resolvedUserId }, select: { id: true } }))
      : false);
    const record = belongsToOrg
      ? await prisma.user.findUnique({
          where: { id: resolvedUserId },
          select: { id: true, name: true, email: true },
        })
      : null;

    const email = record?.email || client?.email;
    if (!email) {
      throw new BadRequestException("This user has no email address on file");
    }
    const name = record?.name || client?.name || carer?.name || "there";

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { settings: true },
    });
    const profile = (org?.settings?.profile as any) || {};
    const orgName = profile.name || org?.name || "PoolCare";

    const emailHtml = createWelcomeEmailTemplate(name, orgName, {
      logoUrl: profile.logoUrl,
      organizationName: orgName,
    });

    await this.notificationsService.send(orgId, {
      channel: "email",
      to: email,
      subject: `Welcome to ${orgName}!`,
      body: `Welcome to ${orgName}! Your account has been created. Download our mobile app to manage your pool services.`,
      metadata: { html: emailHtml },
      recipientId: record?.id || client?.id || carer?.id,
      recipientType: "user",
    } as any);

    return { sent: true, to: email };
  }

  @Post("send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async send(
    @CurrentUser() user: { org_id: string },
    @Body() dto: SendNotificationDto
  ) {
    return this.notificationsService.send(user.org_id, dto);
  }

  @Post("schedule")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async schedule(
    @CurrentUser() user: { org_id: string },
    @Body() dto: SendNotificationDto & { scheduledFor: string }
  ) {
    return this.notificationsService.schedule(user.org_id, dto);
  }

  @Post("broadcast")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async broadcast(
    @CurrentUser() user: { org_id: string },
    @Body() dto: { title: string; body: string; audience: "all" | "clients" | "carers" }
  ) {
    return this.notificationsService.broadcast(user.org_id, dto);
  }
}

