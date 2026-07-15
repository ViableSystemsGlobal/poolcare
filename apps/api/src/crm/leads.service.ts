import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { FilesService } from "../files/files.service";
import { EmailAdapter } from "../notifications/adapters/email.adapter";
import { CrmMessagingService } from "./crm-messaging.service";
import { OpportunitiesService } from "./opportunities.service";
import { CreateLeadPublicDto, CreateLeadDto, UpdateLeadDto, ConvertLeadDto, SendLeadMessageDto, BookAssessmentDto } from "./dto";

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly filesService: FilesService,
    private readonly emailAdapter: EmailAdapter,
    private readonly messaging: CrmMessagingService,
    private readonly opportunities: OpportunitiesService
  ) {}

  // ---- Public website intake -------------------------------------------------
  // Resolves the single-tenant org, stores any pool photos, creates the Lead,
  // and best-effort emails the customer a confirmation. Never throws on
  // photo/email failure — the lead must always be captured.
  async createPublic(dto: CreateLeadPublicDto, files: Express.Multer.File[]) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException("An email or phone number is required");
    }
    // Prefer the pinned single-tenant org (DEFAULT_ORG_ID), else the oldest org.
    const pinnedId = process.env.DEFAULT_ORG_ID;
    const org = pinnedId
      ? (await prisma.organization.findUnique({ where: { id: pinnedId }, select: { id: true } }))
        || (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))
      : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!org) throw new BadRequestException("No organization configured");
    const orgId = org.id;

    const photoUrls: string[] = [];
    for (const file of files || []) {
      try {
        const url = await this.filesService.uploadImage(orgId, file, "crm_lead", orgId);
        photoUrls.push(url);
      } catch (err: any) {
        this.logger.warn(`Lead photo upload failed: ${err?.message ?? err}`);
      }
    }

    const lead = await prisma.lead.create({
      data: {
        orgId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        source: dto.source ?? "website",
        notes: dto.notes,
        poolSize: dto.poolSize,
        chemicals: dto.chemicals,
        address: dto.address,
        photoUrls,
        status: "NEW",
      },
    });

    if (dto.email) {
      this.sendConfirmation(orgId, dto.email, dto.name).catch((err) =>
        this.logger.warn(`Lead confirmation email failed: ${err?.message ?? err}`)
      );
    }

    return { id: lead.id, createdAt: lead.createdAt };
  }

  private async sendConfirmation(orgId: string, email: string, name: string) {
    const subject = "We've received your PoolCare request";
    const text = `Hi ${name},\n\nThanks for reaching out to PoolCare — we've received your request and our team will be in touch shortly with your tailored quote.\n\n— PoolCare`;
    await this.emailAdapter.send(email, subject, text, undefined, orgId);
  }

  // ---- Admin -----------------------------------------------------------------
  async create(orgId: string, dto: CreateLeadDto) {
    const { followUpDate, ...rest } = dto;
    return prisma.lead.create({
      data: {
        orgId,
        ...rest,
        source: rest.source ?? "manual",
        status: rest.status ?? "NEW",
        ...(followUpDate ? { followUpDate: new Date(followUpDate) } : {}),
      },
    });
  }

  async list(
    orgId: string,
    filters: { query?: string; status?: string; source?: string; page: number; limit: number }
  ) {
    const where: any = { orgId };
    if (filters.status) where.status = filters.status;
    if (filters.source) where.source = filters.source;
    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: "insensitive" } },
        { email: { contains: filters.query, mode: "insensitive" } },
        { phone: { contains: filters.query, mode: "insensitive" } },
        { company: { contains: filters.query, mode: "insensitive" } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: "desc" },
        include: { owner: { select: { id: true, name: true } } },
      }),
      prisma.lead.count({ where }),
    ]);
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async getOne(orgId: string, id: string) {
    const lead = await prisma.lead.findFirst({
      where: { id, orgId },
      include: {
        owner: { select: { id: true, name: true } },
        opportunities: { select: { id: true, name: true, stage: true } },
        activities: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true } } } },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async update(orgId: string, id: string, dto: UpdateLeadDto) {
    await this.ensure(orgId, id);
    const { followUpDate, ...rest } = dto;
    return prisma.lead.update({
      where: { id },
      data: {
        ...rest,
        ...(followUpDate !== undefined ? { followUpDate: followUpDate ? new Date(followUpDate) : null } : {}),
      },
    });
  }

  async remove(orgId: string, id: string) {
    await this.ensure(orgId, id);
    await prisma.lead.delete({ where: { id } });
    return { success: true };
  }

  // ---- Convert: Lead -> Account (+ Contact) + Opportunity --------------------
  async convert(orgId: string, id: string, dto: ConvertLeadDto, userId?: string) {
    const lead = await prisma.lead.findFirst({ where: { id, orgId } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (lead.status === "CONVERTED") {
      throw new BadRequestException("Lead has already been converted");
    }

    const { firstName, lastName } = splitName(lead.name);

    return prisma.$transaction(async (tx) => {
      // 1. Resolve or create the Account.
      let accountId = dto.accountId;
      if (accountId) {
        const exists = await tx.account.findFirst({ where: { id: accountId, orgId }, select: { id: true } });
        if (!exists) throw new NotFoundException("Account not found");
      } else {
        const account = await tx.account.create({
          data: {
            orgId,
            name: lead.company || lead.name,
            type: dto.accountType ?? "INDIVIDUAL",
            email: lead.email,
            phone: lead.phone,
            address: lead.address,
            contacts: {
              create: [{ orgId, isPrimary: true, firstName, lastName, email: lead.email, phone: lead.phone }],
            },
          },
        });
        accountId = account.id;
      }

      // 2. Create the Opportunity (pipeline stage lives here).
      const opportunity = await tx.opportunity.create({
        data: {
          orgId,
          accountId,
          leadId: lead.id,
          name: dto.opportunityName || `${lead.name} — ${lead.source ?? "enquiry"}`,
          stage: dto.stage ?? "ASSESSMENT_BOOKED",
          valueCents: dto.valueCents,
          ownerId: lead.ownerId ?? undefined,
        },
      });

      // 3. Optionally schedule the on-site assessment as a meeting.
      if (dto.assessmentDate) {
        await tx.activity.create({
          data: {
            orgId,
            type: "MEETING",
            body: dto.assessmentNotes?.trim() || "On-site pool assessment",
            dueDate: new Date(dto.assessmentDate),
            createdById: userId,
            opportunityId: opportunity.id,
            accountId,
          },
        });
      }

      // 4. Mark the lead converted + log the timeline event.
      await tx.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED" } });
      await tx.activity.create({
        data: {
          orgId,
          type: "STATUS_CHANGE",
          body: dto.assessmentDate
            ? `Assessment booked — lead converted to Account + Opportunity`
            : `Lead converted to Account + Opportunity`,
          createdById: userId,
          leadId: lead.id,
          accountId,
          opportunityId: opportunity.id,
        },
      });

      return { accountId, opportunity };
    });
  }

  // ---- Book Assessment: convert + schedule the on-site assessment ------------
  async bookAssessment(orgId: string, id: string, dto: BookAssessmentDto, userId?: string) {
    const result = await this.convert(
      orgId,
      id,
      {
        accountId: dto.accountId,
        accountType: dto.accountType,
        opportunityName: dto.opportunityName,
        stage: "ASSESSMENT_BOOKED",
        valueCents: dto.valueCents,
        assessmentDate: dto.assessmentDate,
        assessmentNotes: dto.assessmentNotes,
      },
      userId
    );

    // If a team member was assigned at booking, dispatch + email them the form
    // link right away (best-effort: never fail the booking on assignment errors).
    if (dto.assigneeId && result?.opportunity?.id) {
      try {
        const assignment = await this.opportunities.assignAndNotify(
          orgId, userId, result.opportunity.id, dto.assigneeId, dto.assessmentDate, dto.assessmentNotes,
        );
        return { ...result, assignment };
      } catch (e: any) {
        this.logger.warn(`Assessment assignment failed for opportunity ${result.opportunity.id}: ${e?.message}`);
      }
    }
    return result;
  }

  // ---- Communications: send a real Email / SMS / Push + log to timeline -----
  async sendMessage(orgId: string, userId: string | undefined, id: string, dto: SendLeadMessageDto) {
    const lead = await prisma.lead.findFirst({ where: { id, orgId } });
    if (!lead) throw new NotFoundException("Lead not found");

    const { type } = await this.messaging.dispatch(orgId, dto, {
      email: lead.email,
      phone: lead.phone,
      ownerId: lead.ownerId,
      pushTitleFallback: `Lead: ${lead.name}`,
    });

    return prisma.activity.create({
      data: {
        orgId,
        type,
        body: this.messaging.logBody(dto.subject, dto.body),
        leadId: lead.id,
        createdById: userId,
      },
    });
  }

  private async ensure(orgId: string, id: string) {
    const found = await prisma.lead.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!found) throw new NotFoundException("Lead not found");
  }
}

function splitName(full: string): { firstName: string; lastName?: string } {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: full || "Unknown" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
