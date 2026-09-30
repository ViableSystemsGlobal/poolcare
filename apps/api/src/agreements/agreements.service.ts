import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { NotificationsService } from "../notifications/notifications.service";
import { contractedVisitsFor } from "../plans/visit-entitlement";

/**
 * In-app acceptance of the client service agreement and its Schedule B
 * (contract cl. 11.4: app approvals are written approvals; cl. 30.3: a
 * replacement Schedule B changes commercial terms without re-signing; cl. 30.7:
 * reliable electronic signature). Each send snapshots the plan's commercial
 * selections so what the client accepted is fixed even if the plan changes.
 */
@Injectable()
export class AgreementsService {
  private readonly logger = new Logger(AgreementsService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /** Current agreement document (version + PDF) from org settings. */
  async currentDocument(orgId: string): Promise<{ version: string | null; documentUrl: string | null }> {
    const setting = await prisma.orgSetting.findUnique({ where: { orgId }, select: { policies: true } });
    const agreement = (setting?.policies as any)?.agreement || {};
    return { version: agreement.version || null, documentUrl: agreement.documentUrl || null };
  }

  async setDocument(orgId: string, data: { version?: string; documentUrl?: string }) {
    const existing = await prisma.orgSetting.findUnique({ where: { orgId } });
    const policies = (existing?.policies as any) || {};
    const agreement = { ...(policies.agreement || {}) };
    if (data.version !== undefined) agreement.version = String(data.version).trim() || null;
    if (data.documentUrl !== undefined) agreement.documentUrl = data.documentUrl || null;
    await prisma.orgSetting.upsert({
      where: { orgId },
      update: { policies: { ...policies, agreement } },
      create: { orgId, policies: { agreement } },
    });
    return agreement;
  }

  /** Schedule B snapshot built from the plan as it stands now. */
  private async buildScheduleB(plan: any) {
    const months = plan.termMonths || 3;
    const currentTerm = await prisma.subscriptionBilling.findFirst({
      where: { planId: plan.id, status: { in: ["paid", "pending"] } },
      orderBy: { billingPeriodStart: "desc" },
    });
    return {
      client: plan.pool?.client?.name || null,
      serviceProperty: plan.pool?.name || null,
      address: plan.pool?.address || null,
      poolVolumeL: plan.pool?.volumeL || null,
      servicePackage: plan.template?.name || null,
      paymentMode: plan.billingType === "prepaid" ? "Prepaid" : plan.billingType,
      termMonths: plan.billingType === "prepaid" ? months : null,
      monthlyRateCents: plan.priceCents,
      standardRateCents: plan.standardRateCents ?? null,
      termAmountCents: plan.billingType === "prepaid" ? plan.priceCents * months : null,
      currency: plan.currency || "GHS",
      frequency: plan.frequency,
      serviceDays: plan.dow || null,
      contractedVisitsPerTerm: plan.billingType === "prepaid" ? contractedVisitsFor(plan, months) : null,
      emergencyVisitsPerMonth: plan.emergencyVisitsPerMonth ?? 0,
      chemicalAllowanceCents: plan.chemicalAllowanceCents ?? null,
      autoRenew: !!plan.autoRenew,
      servicePeriodStart: currentTerm?.billingPeriodStart || null,
      servicePeriodEnd: currentTerm?.billingPeriodEnd || null,
      authorisedUsers: Array.isArray(plan.authorisedUsers) ? plan.authorisedUsers : [],
      specialConditions: plan.specialConditions || null,
    };
  }

  /** Office sends the agreement + current Schedule B for a plan to its client. */
  async send(orgId: string, planId: string, userId: string) {
    const doc = await this.currentDocument(orgId);
    if (!doc.version) {
      throw new BadRequestException("Set the agreement version in Settings → Policies → Service Agreement first");
    }
    const plan = await prisma.servicePlan.findFirst({
      where: { id: planId, orgId },
      include: { pool: { include: { client: true } }, template: { select: { name: true } } },
    });
    if (!plan) throw new NotFoundException("Service plan not found");
    const client = plan.pool.client;

    const scheduleB = await this.buildScheduleB(plan);
    const [, agreement] = await prisma.$transaction([
      // A replacement Schedule B supersedes anything earlier for this plan (cl. 30.3).
      prisma.serviceAgreement.updateMany({
        where: { planId: plan.id, status: { in: ["pending", "accepted"] } },
        data: { status: "superseded" },
      }),
      prisma.serviceAgreement.create({
        data: {
          orgId,
          clientId: client.id,
          planId: plan.id,
          version: doc.version,
          documentUrl: doc.documentUrl,
          scheduleB,
          sentById: userId,
        },
      }),
    ]);

    if (client.userId) {
      await this.notificationsService
        .send(orgId, {
          channel: "push",
          to: client.userId,
          recipientId: client.userId,
          recipientType: "client",
          subject: "Please review your PoolCare agreement",
          body: `Your service agreement and plan details for ${plan.pool.name || "your pool"} are ready to review and accept in the app.`,
          template: "agreement_sent",
          metadata: { type: "agreement_sent", agreementId: agreement.id, url: `/agreements/${agreement.id}` },
        })
        .catch((err) => this.logger.warn(`Agreement push failed: ${err.message}`));
    }
    return agreement;
  }

  /** Agreements for a plan (office view), newest first. */
  async listForPlan(orgId: string, planId: string) {
    return prisma.serviceAgreement.findMany({ where: { orgId, planId }, orderBy: { sentAt: "desc" } });
  }

  private async clientFor(orgId: string, userId: string) {
    const client = await prisma.client.findFirst({ where: { orgId, userId }, select: { id: true } });
    if (!client) throw new ForbiddenException("Client profile not found");
    return client;
  }

  /** The signed-in client's agreements that are current (pending or accepted). */
  async listMine(orgId: string, userId: string) {
    const client = await this.clientFor(orgId, userId);
    return prisma.serviceAgreement.findMany({
      where: { orgId, clientId: client.id, status: { in: ["pending", "accepted"] } },
      include: { plan: { select: { id: true, pool: { select: { name: true } } } } },
      orderBy: { sentAt: "desc" },
    });
  }

  async getOne(orgId: string, id: string, userId: string, role: string) {
    const agreement = await prisma.serviceAgreement.findFirst({ where: { id, orgId } });
    if (!agreement) throw new NotFoundException("Agreement not found");
    if (role === "CLIENT") {
      const client = await this.clientFor(orgId, userId);
      if (agreement.clientId !== client.id) throw new ForbiddenException("Access denied");
    } else if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Access denied");
    }
    return agreement;
  }

  /** Client accepts by typing their full name; the moment and device are recorded. */
  async accept(orgId: string, id: string, userId: string, name: string, ip: string | null, userAgent: string | null) {
    const client = await this.clientFor(orgId, userId);
    const agreement = await prisma.serviceAgreement.findFirst({ where: { id, orgId, clientId: client.id } });
    if (!agreement) throw new NotFoundException("Agreement not found");
    if (agreement.status !== "pending") {
      throw new BadRequestException(
        agreement.status === "accepted" ? "Already accepted" : "This version has been replaced — open the latest one"
      );
    }
    const typed = (name || "").trim();
    if (typed.length < 3) throw new BadRequestException("Type your full name to accept");

    const accepted = await prisma.serviceAgreement.update({
      where: { id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: userId,
        acceptedName: typed,
        acceptedIp: ip,
        acceptedUserAgent: userAgent?.slice(0, 300) || null,
      },
    });

    const managers = await prisma.orgMember.findMany({
      where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
      include: { user: true },
    });
    for (const m of managers) {
      if (!m.user?.email) continue;
      await this.notificationsService
        .send(orgId, {
          recipientId: m.user.id,
          recipientType: "user",
          channel: "email",
          to: m.user.email,
          subject: `Agreement accepted — ${typed}`,
          body: `${typed} accepted service agreement ${agreement.version} and its Schedule B in the PoolCare app.`,
          template: "agreement_accepted",
          metadata: { type: "agreement_accepted", agreementId: id },
        })
        .catch(() => undefined);
    }
    return accepted;
  }
}
