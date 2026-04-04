import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../../notifications/notifications.service";
import { NewsletterAgentService } from "./newsletter-agent.service";
import { SettingsService } from "../../settings/settings.service";

const POOL_CARE_TIPS: string[] = [
  "Test your pool water at least 2-3 times per week during summer and once per week in winter to maintain proper chemical balance.",
  "Keep your pool's pH level between 7.2 and 7.6 for optimal swimmer comfort and chlorine effectiveness.",
  "Run your pool pump for at least 8-12 hours per day to ensure proper water circulation and filtration.",
  "Skim the surface of your pool daily to remove leaves, insects, and other debris before they sink.",
  "Brush your pool walls and floor weekly to prevent algae buildup and calcium deposits.",
  "Clean your skimmer basket at least once a week to maintain proper water flow and filtration efficiency.",
  "Shock your pool every 1-2 weeks, or after heavy use, rain, or a major temperature change.",
  "Maintain your pool's alkalinity between 80-120 ppm to help stabilize pH levels.",
  "Keep the water level at the center of your pool skimmer for optimal operation.",
  "Backwash your sand or DE filter when the pressure gauge reads 8-10 psi above normal.",
  "Use a pool cover when the pool is not in use to reduce evaporation, heat loss, and debris accumulation.",
  "Inspect your pool equipment regularly for leaks, cracks, or unusual noises.",
  "Calcium hardness should be maintained between 200-400 ppm to protect your pool surfaces and equipment.",
  "Trim trees and bushes near your pool to reduce the amount of debris falling into the water.",
  "Never mix pool chemicals together. Always add chemicals to water, never water to chemicals.",
  "Store pool chemicals in a cool, dry, well-ventilated area away from direct sunlight.",
  "Check and clean your pool filter cartridge every 4-8 weeks for cartridge filters.",
  "Cyanuric acid (stabilizer) levels should be between 30-50 ppm to protect chlorine from UV degradation.",
  "After heavy rain, test your water chemistry as rainwater can significantly alter your pool's balance.",
  "Vacuum your pool at least once a week to remove settled debris from the floor.",
  "Consider using a robotic pool cleaner to reduce manual cleaning time and improve circulation.",
  "Keep a log of your pool's chemical readings to track trends and catch problems early.",
  "If your pool water looks cloudy, check the filter pressure and chemical balance before adding clarifier.",
  "Winterize your pool properly at the end of the season to prevent freeze damage to pipes and equipment.",
  "In spring, open your pool gradually — clean, balance chemicals, and run the pump before swimming.",
  "Solar blankets can raise your pool temperature by 10-15 degrees and cut heating costs significantly.",
  "Phosphates feed algae. If you have recurring algae problems, test for and treat high phosphate levels.",
  "Run your pool pump during off-peak electricity hours to save on energy costs.",
  "Saltwater pools still need regular monitoring — check salt levels, pH, and chlorine output monthly.",
  "A clean pool deck helps keep debris out of the water. Sweep or hose down the area regularly.",
  "Replace worn pool equipment gaskets and O-rings promptly to prevent leaks and costly damage.",
  "Use enzyme-based products to break down oils, lotions, and organic contaminants in your pool water.",
  "LED pool lights use up to 80% less energy than incandescent bulbs and last much longer.",
  "If you notice a strong chlorine smell, your pool likely needs MORE chlorine, not less — shock it.",
  "Always shower before entering the pool to reduce the introduction of body oils and contaminants.",
];

export interface WeeklyQueueEntry {
  day: string;
  dayName: string;
  date: string;
  tipIndex: number;
  tip: string;
  approved: boolean;
}

export interface TipSchedule {
  enabled: boolean;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  lastTipIndex: number;
  weeklyQueue?: WeeklyQueueEntry[];
}

const DEFAULT_TIP_SCHEDULE: TipSchedule = {
  enabled: false,
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
  lastTipIndex: -1,
};

@Injectable()
export class TipSchedulerService {
  private readonly logger = new Logger(TipSchedulerService.name);
  private running = false;

  constructor(
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => NewsletterAgentService))
    private readonly newsletterAgentService: NewsletterAgentService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Get the tip schedule for an organization from integrations JSON.
   */
  async getTipSchedule(orgId: string): Promise<TipSchedule> {
    const orgSetting = await prisma.orgSetting.findUnique({
      where: { orgId },
    });
    const integrations = (orgSetting?.integrations as any) || {};
    const schedule = integrations.tipSchedule || {};
    return { ...DEFAULT_TIP_SCHEDULE, ...schedule };
  }

  /**
   * Update the tip schedule for an organization.
   */
  async updateTipSchedule(
    orgId: string,
    update: Partial<TipSchedule>,
  ): Promise<TipSchedule> {
    let orgSetting = await prisma.orgSetting.findUnique({
      where: { orgId },
    });

    if (!orgSetting) {
      orgSetting = await prisma.orgSetting.create({
        data: { orgId, integrations: {} },
      });
    }

    const integrations = (orgSetting.integrations as any) || {};
    const current = integrations.tipSchedule || {};
    const merged: TipSchedule = { ...DEFAULT_TIP_SCHEDULE, ...current, ...update };

    integrations.tipSchedule = merged;

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return merged;
  }

  /**
   * Send the daily tip for a specific organization.
   */
  async sendDailyTip(orgId: string): Promise<{ sent: boolean; tip?: string }> {
    const schedule = await this.getTipSchedule(orgId);

    if (!schedule.enabled) {
      return { sent: false };
    }

    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ] as const;
    const today = dayNames[new Date().getDay()];

    if (!schedule[today]) {
      return { sent: false };
    }

    // Check if today's tip in the weekly queue has been approved
    const weeklyQueue: WeeklyQueueEntry[] = schedule.weeklyQueue || [];
    const todayEntry = weeklyQueue.find((entry) => entry.dayName === today);
    if (todayEntry && !todayEntry.approved) {
      this.logger.log(`Tip for ${today} in org ${orgId} is not approved — skipping`);
      return { sent: false };
    }

    // Use the tip from the weekly queue if available, otherwise pick next in rotation
    let tip: string;
    let nextIndex: number;
    if (todayEntry) {
      tip = todayEntry.tip;
      nextIndex = todayEntry.tipIndex;
    } else {
      nextIndex = (schedule.lastTipIndex + 1) % POOL_CARE_TIPS.length;
      tip = POOL_CARE_TIPS[nextIndex];
    }

    // Update the last tip index
    await this.updateTipSchedule(orgId, { lastTipIndex: nextIndex });

    // Send to all active clients via push broadcast
    try {
      await this.notificationsService.broadcast(orgId, {
        title: "Pool Tip of the Day",
        body: tip,
        audience: "clients",
      });
      this.logger.log(`Sent tip #${nextIndex} to org ${orgId}`);
    } catch (err: any) {
      this.logger.error(`Failed to send tip to org ${orgId}: ${err.message}`);
    }

    // Also send via SMS to clients who have a phone number
    try {
      const clients = await prisma.client.findMany({
        where: { orgId, phone: { not: null } },
        select: { phone: true, userId: true },
      });

      for (const client of clients) {
        if (!client.phone) continue;
        try {
          await this.notificationsService.send(orgId, {
            recipientId: client.userId,
            recipientType: "client",
            channel: "sms",
            to: client.phone,
            body: `Pool Tip of the Day: ${tip}`,
            template: "tip_of_the_day",
            metadata: { tipIndex: nextIndex },
          });
        } catch (err: any) {
          this.logger.error(
            `Failed to SMS tip to ${client.phone}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to SMS tips for org ${orgId}: ${err.message}`);
    }

    return { sent: true, tip };
  }

  /**
   * Get tip sending history for the org.
   */
  async getTipHistory(orgId: string) {
    const tips = await prisma.notification.findMany({
      where: {
        orgId,
        OR: [
          { template: "tip_of_the_day" },
          { template: "broadcast", subject: "Pool Tip of the Day" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      distinct: ["body"],
      select: {
        id: true,
        body: true,
        channel: true,
        status: true,
        sentAt: true,
        createdAt: true,
        metadata: true,
      },
    });

    return {
      items: tips.map((t) => ({
        id: t.id,
        tip: (t.body || "").replace(/^Pool Tip of the Day:\s*/i, "").replace(/^Pool Tip:\s*/i, "").trim(),
        channel: t.channel,
        status: t.status,
        sentAt: t.sentAt || t.createdAt,
        manual: !!(t.metadata as any)?.manual,
      })),
    };
  }

  /**
   * Send a manual tip immediately to all clients via push broadcast and SMS.
   */
  /**
   * Send a tip manually. If testPhone is provided, sends only to that number (test mode).
   * Otherwise sends to all clients.
   */
  async sendManualTip(orgId: string, tip: string, testPhone?: string): Promise<{ sent: boolean; tip: string; testMode: boolean }> {
    if (testPhone) {
      // Test mode — send only to the provided phone number
      try {
        await this.notificationsService.send(orgId, {
          recipientId: null,
          recipientType: "org",
          channel: "sms",
          to: testPhone,
          body: `Pool Tip of the Day: ${tip}`,
          template: "tip_of_the_day",
          metadata: { manual: true, test: true },
        });
        this.logger.log(`Sent test tip to ${testPhone}`);
      } catch (err: any) {
        this.logger.error(`Failed to send test tip to ${testPhone}: ${err.message}`);
      }
      return { sent: true, tip, testMode: true };
    }

    // Production mode — send to all clients
    try {
      await this.notificationsService.broadcast(orgId, {
        title: "Pool Tip of the Day",
        body: tip,
        audience: "clients",
      });
      this.logger.log(`Sent manual tip to org ${orgId} via push`);
    } catch (err: any) {
      this.logger.error(`Failed to broadcast manual tip to org ${orgId}: ${err.message}`);
    }

    try {
      const clients = await prisma.client.findMany({
        where: { orgId, phone: { not: null } },
        select: { phone: true, userId: true },
      });

      for (const client of clients) {
        if (!client.phone) continue;
        try {
          await this.notificationsService.send(orgId, {
            recipientId: client.userId,
            recipientType: "client",
            channel: "sms",
            to: client.phone,
            body: `Pool Tip of the Day: ${tip}`,
            template: "tip_of_the_day",
            metadata: { manual: true },
          });
        } catch (err: any) {
          this.logger.error(`Failed to SMS manual tip to ${client.phone}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to SMS manual tips for org ${orgId}: ${err.message}`);
    }

    return { sent: true, tip, testMode: false };
  }

  /**
   * Get the weekly tip queue for an organization.
   */
  async getWeeklyQueue(orgId: string): Promise<WeeklyQueueEntry[]> {
    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    const integrations = (orgSetting?.integrations as any) || {};
    return integrations.tipSchedule?.weeklyQueue || [];
  }

  /**
   * Approve all tips in the weekly queue.
   */
  async approveWeeklyTips(orgId: string): Promise<WeeklyQueueEntry[]> {
    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    if (!orgSetting) throw new Error("Org settings not found");

    const integrations = (orgSetting.integrations as any) || {};
    const weeklyQueue: WeeklyQueueEntry[] = integrations.tipSchedule?.weeklyQueue || [];

    for (const entry of weeklyQueue) {
      entry.approved = true;
    }

    integrations.tipSchedule = {
      ...integrations.tipSchedule,
      weeklyQueue,
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return weeklyQueue;
  }

  /**
   * Update a specific tip in the weekly queue by index.
   */
  async updateWeeklyTip(orgId: string, index: number, newTip: string): Promise<WeeklyQueueEntry[]> {
    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    if (!orgSetting) throw new Error("Org settings not found");

    const integrations = (orgSetting.integrations as any) || {};
    const weeklyQueue: WeeklyQueueEntry[] = integrations.tipSchedule?.weeklyQueue || [];

    if (index < 0 || index >= weeklyQueue.length) {
      throw new Error(`Invalid tip index: ${index}`);
    }

    weeklyQueue[index].tip = newTip;

    integrations.tipSchedule = {
      ...integrations.tipSchedule,
      weeklyQueue,
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return weeklyQueue;
  }

  /**
   * Cron: runs daily at 8 AM. Checks all orgs for tip schedule and sends tips.
   */
  @Cron("0 8 * * *")
  async handleDailyTipCron() {
    if (this.running) return;
    this.running = true;

    try {
      this.logger.log("Running daily tip scheduler...");

      // Find all orgs that have tip schedule enabled
      const orgSettings = await prisma.orgSetting.findMany({
        select: { orgId: true, integrations: true },
      });

      for (const os of orgSettings) {
        const integrations = (os.integrations as any) || {};
        const tipSchedule = integrations.tipSchedule;
        if (!tipSchedule || !tipSchedule.enabled) continue;

        try {
          await this.sendDailyTip(os.orgId);
        } catch (err: any) {
          this.logger.error(
            `Tip scheduler error for org ${os.orgId}: ${err.message}`,
          );
        }
      }

      this.logger.log("Daily tip scheduler complete.");
    } finally {
      this.running = false;
    }
  }

  /**
   * Cron: runs every Sunday at 6 PM. Pre-selects weekly tips and auto-generates
   * newsletter drafts, then notifies org admins to review.
   */
  @Cron("0 18 * * 0")
  async prepareWeeklyContent() {
    this.logger.log("Running weekly content preparation...");

    const orgSettings = await prisma.orgSetting.findMany({
      select: { orgId: true, integrations: true },
    });

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

    const weekRange = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    for (const os of orgSettings) {
      const integrations = (os.integrations as any) || {};
      const orgId = os.orgId;

      const tipsQueued = await this.prepareWeeklyTips(orgId, integrations, weekStart);
      const newsletterDrafted = await this.prepareWeeklyNewsletter(orgId, weekRange);

      // Notify admins if anything was prepared
      if (tipsQueued || newsletterDrafted) {
        await this.notifyAdmins(orgId, weekRange, tipsQueued, newsletterDrafted);
      }
    }

    this.logger.log("Weekly content preparation complete.");
  }

  /**
   * Manually prepare weekly content for a single org (admin trigger).
   */
  async prepareWeeklyContentForOrg(orgId: string) {
    const os = await prisma.orgSetting.findUnique({ where: { orgId }, select: { integrations: true } });
    const integrations = (os?.integrations as any) || {};

    const now = new Date();
    const weekStart = new Date(now);
    // Next Monday (or today if Monday)
    const dayOfWeek = weekStart.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + daysUntilMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekRange = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    // Force-prepare tips even if schedule isn't fully enabled (manual trigger)
    await this.prepareWeeklyTipsForced(orgId, integrations, weekStart);
    // Newsletter draft is optional — only if LLM is configured
    try {
      await this.prepareWeeklyNewsletter(orgId, weekRange);
    } catch (e) {
      this.logger.warn(`Newsletter draft skipped for org ${orgId}: ${e.message}`);
    }
  }

  /**
   * Prepare weekly tips regardless of enabled state (for manual trigger).
   * Uses enabled days if configured, otherwise defaults to Mon/Wed/Fri.
   */
  private async prepareWeeklyTipsForced(
    orgId: string,
    integrations: any,
    weekStart: Date,
  ): Promise<boolean> {
    const tipSchedule = integrations.tipSchedule || {};
    const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

    // Use configured days, or default to Mon/Wed/Fri
    let enabledDays = dayNames.filter((d) => tipSchedule[d]);
    if (enabledDays.length === 0) {
      enabledDays = ["monday", "wednesday", "friday"];
    }

    let currentIndex = tipSchedule.lastTipIndex ?? -1;
    const weeklyQueue: WeeklyQueueEntry[] = [];

    for (let i = 0; i < 7; i++) {
      const dayName = dayNames[i];
      if (!enabledDays.includes(dayName)) continue;

      currentIndex = (currentIndex + 1) % POOL_CARE_TIPS.length;
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);

      weeklyQueue.push({
        day: dayName,
        dayName,
        date: date.toISOString().slice(0, 10),
        tipIndex: currentIndex,
        tip: POOL_CARE_TIPS[currentIndex],
        approved: false,
      });
    }

    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    if (!orgSetting) return false;

    const updatedIntegrations = (orgSetting.integrations as any) || {};
    updatedIntegrations.tipSchedule = {
      ...updatedIntegrations.tipSchedule,
      enabled: true,
      weeklyQueue,
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations: updatedIntegrations },
    });

    this.logger.log(`Force-queued ${weeklyQueue.length} tips for org ${orgId}`);
    return true;
  }

  /**
   * Pre-select the coming week's tips based on enabled days and store in weeklyQueue.
   */
  private async prepareWeeklyTips(
    orgId: string,
    integrations: any,
    weekStart: Date,
  ): Promise<boolean> {
    const tipSchedule = integrations.tipSchedule;
    if (!tipSchedule || !tipSchedule.enabled) return false;

    const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
    const enabledDays = dayNames.filter((d) => tipSchedule[d]);

    if (enabledDays.length === 0) return false;

    let currentIndex = tipSchedule.lastTipIndex ?? -1;
    const weeklyQueue: WeeklyQueueEntry[] = [];

    for (let i = 0; i < 7; i++) {
      const dayName = dayNames[i];
      if (!tipSchedule[dayName]) continue;

      currentIndex = (currentIndex + 1) % POOL_CARE_TIPS.length;
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);

      weeklyQueue.push({
        day: dayName,
        dayName,
        date: date.toISOString().slice(0, 10),
        tipIndex: currentIndex,
        tip: POOL_CARE_TIPS[currentIndex],
        approved: false,
      });
    }

    // Store the weekly queue in org settings
    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    if (!orgSetting) return false;

    const updatedIntegrations = (orgSetting.integrations as any) || {};
    updatedIntegrations.tipSchedule = {
      ...updatedIntegrations.tipSchedule,
      weeklyQueue,
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations: updatedIntegrations },
    });

    this.logger.log(`Queued ${weeklyQueue.length} tips for org ${orgId}`);
    return true;
  }

  /**
   * Auto-generate a newsletter draft if the org has LLM configured.
   * Passes the coming week's pre-selected tips so the newsletter includes them.
   */
  private async prepareWeeklyNewsletter(
    orgId: string,
    weekRange: string,
  ): Promise<boolean> {
    try {
      const llmConfig = await this.settingsService.getLlmConfig(orgId);
      if (!llmConfig || !llmConfig.apiKey) return false;

      // Retrieve the coming week's pre-selected tips from the weeklyQueue
      const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
      const integrations = (orgSetting?.integrations as any) || {};
      const weeklyQueue: Array<{ tip: string }> = integrations.tipSchedule?.weeklyQueue || [];
      const comingWeekTips = weeklyQueue.map((q) => q.tip).filter(Boolean);

      const newsletter = await this.newsletterAgentService.generateNewsletter(
        orgId,
        undefined,
        undefined,
        comingWeekTips.length > 0 ? comingWeekTips : undefined,
      );

      await this.newsletterAgentService.saveDraft(
        orgId,
        newsletter.subject,
        newsletter.htmlBody,
        { weekRange, autoGenerated: true, includedTips: comingWeekTips },
      );

      this.logger.log(`Generated newsletter draft for org ${orgId} (${weekRange})`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to generate newsletter for org ${orgId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Notify all admins/managers in the org via email and SMS.
   */
  private async notifyAdmins(
    orgId: string,
    weekRange: string,
    tipsQueued: boolean,
    newsletterDrafted: boolean,
  ): Promise<void> {
    try {
      const managers = await prisma.orgMember.findMany({
        where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
        include: { user: true },
      });

      const parts: string[] = [];
      if (tipsQueued) parts.push("weekly tips");
      if (newsletterDrafted) parts.push("newsletter draft");
      const contentLabel = parts.join(" and ");

      const message = `Your ${contentLabel} for ${weekRange} are ready for review. Log in to approve and send.`;
      const subject = `Weekly Content Ready - ${weekRange}`;

      for (const manager of managers) {
        if (!manager.user) continue;

        // Email notification
        if (manager.user.email) {
          try {
            await this.notificationsService.send(orgId, {
              channel: "email",
              to: manager.user.email,
              recipientId: manager.user.id,
              recipientType: "user",
              subject,
              body: message,
              template: "weekly_content_ready",
              metadata: {
                type: "weekly_content_ready",
                weekRange,
                tipsQueued,
                newsletterDrafted,
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #0d9488;">Weekly Content Ready for Review</h2>
                  <p style="font-size: 16px; line-height: 1.6; color: #333;">${message}</p>
                  ${tipsQueued ? '<p style="color: #555;">&#x2713; Weekly tips have been pre-selected</p>' : ""}
                  ${newsletterDrafted ? '<p style="color: #555;">&#x2713; Newsletter draft has been generated</p>' : ""}
                  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                  <p style="font-size: 12px; color: #999;">Log in to your dashboard to review and approve.</p>
                </div>`,
              },
            });
          } catch (err: any) {
            this.logger.error(`Failed to email admin ${manager.user.email}: ${err.message}`);
          }
        }

        // SMS notification
        if (manager.user.phone) {
          try {
            await this.notificationsService.send(orgId, {
              channel: "sms",
              to: manager.user.phone,
              recipientId: manager.user.id,
              recipientType: "user",
              subject,
              body: message,
              template: "weekly_content_ready",
              metadata: {
                type: "weekly_content_ready",
                weekRange,
              },
            });
          } catch (err: any) {
            this.logger.error(`Failed to SMS admin ${manager.user.phone}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to notify admins for org ${orgId}: ${err.message}`);
    }
  }
}
