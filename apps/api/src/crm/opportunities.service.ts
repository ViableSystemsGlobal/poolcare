import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { prisma } from "@poolcare/db";
import { CreateOpportunityDto, UpdateOpportunityDto, SendMessageDto, UpsertAssessmentDto, DispatchAssessmentDto, SubmitAssessmentFormDto } from "./dto";
import { CrmMessagingService } from "./crm-messaging.service";
import { PushAdapter } from "../notifications/adapters/push.adapter";
import { EmailAdapter } from "../notifications/adapters/email.adapter";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";

// The assessment form lives on the PUBLIC marketing site (no login), not the admin.
// NEXT_PUBLIC_SITE_URL must be set in production — the localhost fallback is for
// local dev only, and shipped real carers a localhost link when it was unset.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.WEBSITE_PUBLIC_URL || "http://localhost:3003";

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly messaging: CrmMessagingService,
    private readonly push: PushAdapter,
    private readonly email: EmailAdapter,
  ) {}

  async list(
    orgId: string,
    filters: { stage?: string; accountId?: string; page: number; limit: number }
  ) {
    const where: any = { orgId };
    if (filters.stage) where.stage = filters.stage;
    if (filters.accountId) where.accountId = filters.accountId;
    const [items, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: "desc" },
        include: {
          account: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async getOne(orgId: string, id: string) {
    const opp = await prisma.opportunity.findFirst({
      where: { id, orgId },
      include: {
        account: { select: { id: true, name: true, email: true, phone: true, clientId: true } },
        lead: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 50, include: { createdBy: { select: { id: true, name: true } } } },
        assessment: { include: { assessor: { select: { id: true, name: true } }, assignedCarer: { select: { id: true, name: true } } } },
      },
    });
    if (!opp) throw new NotFoundException("Opportunity not found");
    return opp;
  }

  async create(orgId: string, dto: CreateOpportunityDto) {
    const account = await prisma.account.findFirst({
      where: { id: dto.accountId, orgId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException("Account not found");
    const { expectedCloseDate, ...rest } = dto;
    return prisma.opportunity.create({
      data: {
        orgId,
        ...rest,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
      },
    });
  }

  async update(orgId: string, id: string, dto: UpdateOpportunityDto) {
    await this.ensure(orgId, id);
    const { expectedCloseDate, stage, ...rest } = dto;
    const data: any = { ...rest };
    if (stage) {
      data.stage = stage;
      // Stamp the win date when an opportunity is marked WON.
      if (stage === "WON") data.wonAt = new Date();
    }
    if (expectedCloseDate !== undefined) {
      data.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
    }
    return prisma.opportunity.update({ where: { id }, data });
  }

  async remove(orgId: string, id: string) {
    await this.ensure(orgId, id);
    await prisma.opportunity.delete({ where: { id } });
    return { success: true };
  }

  // Pipeline metrics: count + open value per stage, plus totals.
  async metrics(orgId: string) {
    const grouped = await prisma.opportunity.groupBy({
      by: ["stage"],
      where: { orgId },
      _count: { _all: true },
      _sum: { valueCents: true },
    });
    const byStage = grouped.map((g) => ({
      stage: g.stage,
      count: g._count._all,
      valueCents: g._sum.valueCents ?? 0,
    }));
    const openValueCents = byStage
      .filter((s) => s.stage !== "WON" && s.stage !== "LOST")
      .reduce((sum, s) => sum + s.valueCents, 0);
    const total = byStage.reduce((sum, s) => sum + s.count, 0);
    return { byStage, openValueCents, total };
  }

  // Send a real Email / SMS / Push. Email/SMS resolve to the linked account's
  // contact details; push goes to the opportunity's owner.
  async sendMessage(orgId: string, userId: string | undefined, id: string, dto: SendMessageDto) {
    const opp = await prisma.opportunity.findFirst({
      where: { id, orgId },
      include: { account: { select: { name: true, email: true, phone: true } } },
    });
    if (!opp) throw new NotFoundException("Opportunity not found");

    const { type } = await this.messaging.dispatch(orgId, dto, {
      email: opp.account?.email,
      phone: opp.account?.phone,
      ownerId: opp.ownerId,
      pushTitleFallback: `Opportunity: ${opp.name}`,
    });

    return prisma.activity.create({
      data: {
        orgId,
        type,
        body: this.messaging.logBody(dto.subject, dto.body),
        opportunityId: opp.id,
        createdById: userId,
      },
    });
  }

  // Create or update the on-site assessment report for an opportunity.
  async upsertAssessment(orgId: string, userId: string | undefined, oppId: string, dto: UpsertAssessmentDto) {
    const opp = await prisma.opportunity.findFirst({ where: { id: oppId, orgId }, select: { id: true } });
    if (!opp) throw new NotFoundException("Opportunity not found");

    const { applyToDealValue, assessedAt, ...rest } = dto;
    const completing = dto.status === "COMPLETED";

    const data: any = { ...rest };
    if (assessedAt !== undefined) data.assessedAt = assessedAt ? new Date(assessedAt) : null;

    const report = await prisma.assessmentReport.upsert({
      where: { opportunityId: oppId },
      create: {
        orgId,
        opportunityId: oppId,
        assessorId: userId,
        ...data,
        // Stamp completion time when marked completed without an explicit date.
        assessedAt: data.assessedAt ?? (completing ? new Date() : undefined),
      },
      update: {
        ...data,
        ...(completing ? { assessedAt: data.assessedAt ?? new Date(), assessorId: userId } : {}),
      },
      include: { assessor: { select: { id: true, name: true } } },
    });

    // Optionally push the estimated cost onto the deal value.
    if (applyToDealValue && dto.estimatedCostCents != null) {
      await prisma.opportunity.update({ where: { id: oppId }, data: { valueCents: dto.estimatedCostCents } });
    }

    // Log a timeline entry when the assessment is completed.
    if (completing) {
      await prisma.activity.create({
        data: {
          orgId,
          type: "STATUS_CHANGE",
          body: "On-site assessment completed",
          createdById: userId,
          opportunityId: oppId,
        },
      });
    }

    return report;
  }

  // Controller entry: assign a team member + schedule, email them the form link.
  async dispatchAssessment(orgId: string, userId: string | undefined, oppId: string, dto: DispatchAssessmentDto) {
    return this.assignAndNotify(orgId, userId, oppId, dto.assigneeId, dto.scheduledAt, dto.note);
  }

  /**
   * Assign a team member (User) to perform the on-site assessment: mark the
   * report DISPATCHED, generate a secure form token, email them a no-login link
   * to fill it in, and log a timeline entry. Shared by Book Assessment + the
   * opportunity's dispatch/reassign action. Email is best-effort.
   */
  async assignAndNotify(orgId: string, byUserId: string | undefined, oppId: string, assigneeId: string, scheduledAtIso: string, note?: string) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: oppId, orgId },
      select: { id: true, name: true, account: { select: { name: true } } },
    });
    if (!opp) throw new NotFoundException("Opportunity not found");

    // The assignee must be a member of this org.
    const member = await prisma.orgMember.findFirst({
      where: { orgId, userId: assigneeId },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!member) throw new NotFoundException("That team member isn't in this organization");
    const assignee = member.user;

    const scheduledAt = new Date(scheduledAtIso);
    const token = randomBytes(24).toString("hex");

    const report = await prisma.assessmentReport.upsert({
      where: { opportunityId: oppId },
      create: {
        orgId, opportunityId: oppId, status: "DISPATCHED",
        assessorId: assignee.id, scheduledAt, dispatchedAt: new Date(),
        formToken: token, formSentAt: new Date(),
      },
      update: {
        status: "DISPATCHED",
        assessorId: assignee.id, scheduledAt, dispatchedAt: new Date(),
        formToken: token, formSentAt: new Date(),
      },
      include: { assessor: { select: { id: true, name: true } } },
    });

    const when = scheduledAt.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
    const account = opp.account?.name || opp.name;
    const formUrl = `${SITE_URL}/assess/${token}`;
    let emailed = false;
    if (assignee.email) {
      const text = `You've been assigned a pool assessment for ${account}, scheduled ${when}.${note ? `\n\nNote: ${note}` : ""}\n\nOpen the assessment form (no login needed):\n${formUrl}`;
      const orgSettings = await getOrgEmailSettings(orgId);
      const content = `
        <p style="margin:0 0 16px">You've been assigned a pool assessment for <strong>${account}</strong>, scheduled <strong>${when}</strong>.</p>
        ${note ? `<p style="margin:0 0 16px">Note: ${note}</p>` : ""}
        <p style="margin:0 0 16px"><a href="${formUrl}" style="display:inline-block;background:${orgSettings.primaryColor || "#0d9488"};color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open the assessment form</a></p>
        <p style="margin:0;color:#888;font-size:12px">No login required. Or paste this link: <a href="${formUrl}" style="color:#888">${formUrl}</a></p>
      `;
      const html = createEmailTemplate(content, orgSettings);
      try {
        await this.email.send(assignee.email, `Pool assessment assigned: ${account}`, text, html, orgId);
        emailed = true;
      } catch { emailed = false; }
    }

    await prisma.activity.create({
      data: {
        orgId, type: "STATUS_CHANGE",
        body: `Assessment assigned to ${assignee.name || assignee.email || "team member"} for ${when}` + (emailed ? " (emailed form link)" : " (no email on file)"),
        createdById: byUserId, opportunityId: oppId,
      },
    });

    return { ...report, emailed, formUrl };
  }

  // ---- Public form (no auth; gated by the unguessable form token) -----------
  async getByFormToken(token: string) {
    const r = await prisma.assessmentReport.findFirst({
      where: { formToken: token },
      include: {
        assessor: { select: { name: true } },
        opportunity: { select: { name: true, account: { select: { name: true } } } },
      },
    });
    if (!r) throw new NotFoundException("This assessment link is invalid or has expired");
    const { formToken, orgId, opportunityId, assessorId, dispatchedAt, formSentAt, assignedCarerId, ...fields } = r as any;
    return {
      account: r.opportunity?.account?.name || r.opportunity?.name || "Pool assessment",
      assessorName: r.assessor?.name || null,
      scheduledAt: r.scheduledAt,
      status: r.status,
      fields,
    };
  }

  /**
   * Assessments scheduled on a given day, grouped by assessor — the daily
   * dispatch view. Stops come back in visit order so the UI (and any routing
   * hand-off) can use them directly. `date` is YYYY-MM-DD in server time.
   */
  async assessmentsForDay(orgId: string, date?: string) {
    const day = date ? new Date(`${date}T00:00:00`) : new Date();
    if (Number.isNaN(day.getTime())) throw new BadRequestException("Invalid date");
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);

    const reports = await prisma.assessmentReport.findMany({
      where: { orgId, scheduledAt: { gte: start, lt: end } },
      orderBy: { scheduledAt: "asc" },
      include: {
        assessor: { select: { id: true, name: true, email: true, phone: true } },
        assignedCarer: { select: { id: true, name: true, phone: true, homeBaseLat: true, homeBaseLng: true } },
        opportunity: {
          select: {
            id: true, name: true,
            account: { select: { id: true, name: true } },
            lead: { select: { address: true } },
          },
        },
      },
    });

    // Group by assessor; unassigned reports collect under a null key so they
    // are visible rather than silently dropped from the day's view.
    const groups = new Map<string, any>();
    for (const r of reports) {
      const key = r.assessorId ?? "unassigned";
      if (!groups.has(key)) {
        groups.set(key, {
          assessorId: r.assessorId,
          assessorName: r.assessor?.name || r.assessor?.email || "Unassigned",
          carer: r.assignedCarer ?? null,
          stops: [] as any[],
        });
      }
      groups.get(key).stops.push({
        id: r.id,
        opportunityId: r.opportunityId,
        client: r.opportunity?.account?.name || r.opportunity?.name || "—",
        scheduledAt: r.scheduledAt,
        status: r.status,
        lat: r.lat,
        lng: r.lng,
        address: r.capturedAddress || r.opportunity?.lead?.address || null,
        hasLocation: r.lat != null && r.lng != null,
      });
    }

    const routes = [...groups.values()];
    return {
      date: start.toISOString().slice(0, 10),
      total: reports.length,
      completed: reports.filter((r) => r.status === "COMPLETED").length,
      withLocation: reports.filter((r) => r.lat != null && r.lng != null).length,
      routes,
    };
  }

  async submitFormByToken(token: string, dto: SubmitAssessmentFormDto) {
    const r = await prisma.assessmentReport.findFirst({ where: { formToken: token }, select: { id: true, orgId: true, opportunityId: true } });
    if (!r) throw new NotFoundException("This assessment link is invalid or has expired");
    // Stamp locationAt only when coordinates actually came through, so a form
    // submitted without location permission doesn't look like a captured pin.
    const hasLocation = typeof dto.lat === "number" && typeof dto.lng === "number";
    const updated = await prisma.assessmentReport.update({
      where: { id: r.id },
      data: {
        ...dto,
        status: "COMPLETED",
        assessedAt: new Date(),
        ...(hasLocation ? { locationAt: new Date() } : {}),
      },
    });
    await prisma.activity.create({
      data: { orgId: r.orgId, type: "STATUS_CHANGE", body: "On-site assessment completed via field form", opportunityId: r.opportunityId },
    });
    return { ok: true, status: updated.status };
  }

  // Resolve a form token to its org (for the public photo-upload endpoint).
  async orgForFormToken(token: string): Promise<string> {
    const r = await prisma.assessmentReport.findFirst({ where: { formToken: token }, select: { orgId: true } });
    if (!r) throw new NotFoundException("This assessment link is invalid or has expired");
    return r.orgId;
  }

  private async ensure(orgId: string, id: string) {
    const found = await prisma.opportunity.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!found) throw new NotFoundException("Opportunity not found");
  }
}
