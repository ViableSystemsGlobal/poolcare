import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { Prisma } from "@prisma/client";
import { CarersService } from "../carers/carers.service";
import { PushAdapter } from "../notifications/adapters/push.adapter";
import { EmailAdapter } from "../notifications/adapters/email.adapter";

const slugify = (s: string) =>
  (s || "").toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);

const POSTING_STATUSES = ["draft", "open", "closed"];
const APPLICATION_STATUSES = ["new", "shortlisted", "interview", "offer", "hired", "rejected"];
const VERDICTS = ["advance", "hold", "reject"];

const NOTE_AUTHOR = { select: { id: true, name: true, email: true } };

@Injectable()
export class CareersService {
  private readonly logger = new Logger(CareersService.name);

  constructor(
    private readonly carers: CarersService,
    private readonly push: PushAdapter,
    private readonly email: EmailAdapter,
  ) {}

  private static cleanCriteria(input: unknown): string[] | undefined {
    if (input === undefined) return undefined;
    if (!Array.isArray(input)) return [];
    return [...new Set(input.map((c) => String(c).trim()).filter(Boolean))].slice(0, 8);
  }

  private async actorName(userId?: string) {
    if (!userId) return "Someone";
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return u?.name || u?.email || "Someone";
  }

  private systemNote(orgId: string, applicationId: string, body: string) {
    return prisma.jobApplicationNote.create({ data: { orgId, applicationId, kind: "system", body } });
  }
  // Single-tenant org (matches the website CMS / blog).
  async resolveOrgId(): Promise<string> {
    const pinned = process.env.WEBSITE_ORG_ID;
    if (pinned) {
      const org = await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true } });
      if (org) return org.id;
    }
    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!org) throw new NotFoundException("No organization found");
    return org.id;
  }

  private async uniqueSlug(orgId: string, base: string, excludeId?: string) {
    let slug = slugify(base) || "role";
    for (let i = 0; i < 20; i++) {
      const clash = await prisma.jobPosting.findFirst({
        where: { orgId, slug, NOT: excludeId ? { id: excludeId } : undefined },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${slugify(base)}-${i + 2}`;
    }
    return `${slugify(base)}-${Date.now()}`;
  }

  /* ------------------------------- postings ------------------------------ */
  async listPostings(status?: string) {
    const orgId = await this.resolveOrgId();
    const postings = await prisma.jobPosting.findMany({
      where: { orgId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { applications: true } } },
    });
    return { postings };
  }

  async getPosting(id: string) {
    const orgId = await this.resolveOrgId();
    const posting = await prisma.jobPosting.findFirst({
      where: { id, orgId },
      include: { _count: { select: { applications: true } } },
    });
    if (!posting) throw new NotFoundException("Job posting not found");
    return posting;
  }

  async createPosting(data: any) {
    const orgId = await this.resolveOrgId();
    if (!data?.title?.trim()) throw new BadRequestException("Title is required");
    if (!data?.description?.trim()) throw new BadRequestException("Description is required");
    const slug = await this.uniqueSlug(orgId, data.slug || data.title);
    return prisma.jobPosting.create({
      data: {
        orgId,
        title: data.title.trim(),
        slug,
        department: data.department || null,
        location: data.location || "Accra, Ghana",
        employmentType: data.employmentType || "full-time",
        summary: data.summary || null,
        description: data.description,
        requirements: data.requirements || null,
        salaryRange: data.salaryRange || null,
        criteria: CareersService.cleanCriteria(data.criteria) || [],
        status: POSTING_STATUSES.includes(data.status) ? data.status : "draft",
        postedAt: data.status === "open" ? new Date() : null,
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
      },
    });
  }

  async updatePosting(id: string, data: any) {
    const posting = await this.getPosting(id);
    const orgId = posting.orgId;
    const patch: any = {};
    for (const k of ["title", "department", "location", "employmentType", "summary", "description", "requirements", "salaryRange"]) {
      if (data[k] !== undefined) patch[k] = data[k] || null;
    }
    if (patch.title !== undefined && !patch.title) throw new BadRequestException("Title is required");
    if (patch.description !== undefined && !patch.description) throw new BadRequestException("Description is required");
    const criteria = CareersService.cleanCriteria(data.criteria);
    if (criteria !== undefined) patch.criteria = criteria;
    if (data.slug !== undefined) patch.slug = await this.uniqueSlug(orgId, data.slug || posting.title, id);
    if (data.closesAt !== undefined) patch.closesAt = data.closesAt ? new Date(data.closesAt) : null;
    if (data.status !== undefined) {
      if (!POSTING_STATUSES.includes(data.status)) throw new BadRequestException("Invalid status");
      patch.status = data.status;
      if (data.status === "open" && !posting.postedAt) patch.postedAt = new Date();
    }
    return prisma.jobPosting.update({ where: { id }, data: patch });
  }

  async deletePosting(id: string) {
    await this.getPosting(id);
    await prisma.jobPosting.delete({ where: { id } });
    return { ok: true };
  }

  /* ----------------------------- applications ---------------------------- */
  async listApplications(opts: { postingId?: string; status?: string } = {}) {
    const orgId = await this.resolveOrgId();
    const applications = await prisma.jobApplication.findMany({
      where: {
        orgId,
        ...(opts.postingId ? { postingId: opts.postingId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        posting: { select: { id: true, title: true, slug: true } },
        reviews: { select: { verdict: true, rating: true, reviewer: NOTE_AUTHOR } },
        _count: { select: { threadNotes: { where: { kind: "comment" } } } },
      },
    });
    return { applications };
  }

  async getApplication(id: string) {
    const orgId = await this.resolveOrgId();
    const application = await prisma.jobApplication.findFirst({
      where: { id, orgId },
      include: {
        posting: { select: { id: true, title: true, slug: true, status: true, criteria: true } },
        threadNotes: { orderBy: { createdAt: "asc" }, include: { author: NOTE_AUTHOR } },
        reviews: { orderBy: { createdAt: "asc" }, include: { reviewer: NOTE_AUTHOR } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");
    // Same candidate applying to other roles (matched by email).
    const otherApplications = await prisma.jobApplication.findMany({
      where: { orgId, id: { not: id }, email: { equals: application.email, mode: "insensitive" } },
      select: { id: true, status: true, createdAt: true, posting: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { ...application, otherApplications };
  }

  async updateApplication(id: string, data: { status?: string; notes?: string }, actorId?: string) {
    const orgId = await this.resolveOrgId();
    const app = await prisma.jobApplication.findFirst({ where: { id, orgId } });
    if (!app) throw new NotFoundException("Application not found");
    const patch: any = {};
    if (data.status !== undefined) {
      if (!APPLICATION_STATUSES.includes(data.status)) throw new BadRequestException("Invalid status");
      patch.status = data.status;
    }
    if (data.notes !== undefined) patch.notes = data.notes || null;
    const updated = await prisma.jobApplication.update({ where: { id }, data: patch });
    if (patch.status && patch.status !== app.status) {
      const who = await this.actorName(actorId);
      const label = patch.status === "rejected" ? "Rejected" : patch.status === "new" && app.status === "rejected" ? "Reinstated" : `Moved to ${patch.status}`;
      await this.systemNote(orgId, id, `${label} by ${who}`);
    }
    return updated;
  }

  /* --------------------------- review & discussion ------------------------ */
  async addComment(id: string, authorId: string, body: string) {
    const orgId = await this.resolveOrgId();
    const app = await prisma.jobApplication.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!app) throw new NotFoundException("Application not found");
    if (!body?.trim()) throw new BadRequestException("Comment cannot be empty");
    return prisma.jobApplicationNote.create({
      data: { orgId, applicationId: id, authorId, body: body.trim() },
      include: { author: NOTE_AUTHOR },
    });
  }

  async setReview(id: string, reviewerId: string, data: { verdict?: string; rating?: number | null; scores?: Record<string, number> | null }) {
    const orgId = await this.resolveOrgId();
    const app = await prisma.jobApplication.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!app) throw new NotFoundException("Application not found");
    if (!data.verdict || !VERDICTS.includes(data.verdict)) throw new BadRequestException("Verdict must be advance, hold or reject");
    const rating = data.rating == null ? null : Math.max(1, Math.min(5, Math.round(data.rating)));
    let scores: Record<string, number> | null | undefined = undefined;
    if (data.scores !== undefined) {
      scores = null;
      if (data.scores && typeof data.scores === "object") {
        const cleaned = Object.fromEntries(
          Object.entries(data.scores)
            .filter(([k, v]) => k && typeof v === "number")
            .slice(0, 8)
            .map(([k, v]) => [String(k).slice(0, 60), Math.max(1, Math.min(5, Math.round(v)))]),
        );
        scores = Object.keys(cleaned).length ? cleaned : null;
      }
    }

    const existing = await prisma.jobApplicationReview.findUnique({
      where: { applicationId_reviewerId: { applicationId: id, reviewerId } },
    });
    const review = await prisma.jobApplicationReview.upsert({
      where: { applicationId_reviewerId: { applicationId: id, reviewerId } },
      create: { orgId, applicationId: id, reviewerId, verdict: data.verdict, rating, scores: scores ?? undefined },
      update: { verdict: data.verdict, rating, ...(scores !== undefined ? { scores: scores === null ? Prisma.DbNull : scores } : {}) },
      include: { reviewer: NOTE_AUTHOR },
    });
    if (!existing || existing.verdict !== data.verdict) {
      const who = await this.actorName(reviewerId);
      const label = data.verdict === "advance" ? "Advance" : data.verdict === "hold" ? "Hold" : "Reject";
      await this.systemNote(orgId, id, `${who} set their verdict to ${label}${rating ? ` (${rating}/5)` : ""}`);
    }
    return review;
  }

  /* ---------------------------- candidate emails -------------------------- */
  async emailCandidate(id: string, actorId: string, data: { subject?: string; body?: string }) {
    const orgId = await this.resolveOrgId();
    const app = await prisma.jobApplication.findFirst({ where: { id, orgId }, select: { id: true, email: true, name: true } });
    if (!app) throw new NotFoundException("Application not found");
    const subject = data.subject?.trim();
    const body = data.body?.trim();
    if (!subject || !body) throw new BadRequestException("Subject and body are required");

    await this.email.send(app.email, subject, body, undefined, orgId);
    const who = await this.actorName(actorId);
    await this.systemNote(orgId, id, `📧 Email sent to candidate by ${who} — "${subject}"\n\n${body}`);
    return { ok: true };
  }

  /* --------------------------------- stats -------------------------------- */
  async getStats() {
    const orgId = await this.resolveOrgId();
    const newApplications = await prisma.jobApplication.count({ where: { orgId, status: "new" } });
    return { newApplications };
  }

  /* ------------------------------ hire → carer ---------------------------- */
  async hireToCarer(id: string, actorId?: string) {
    const orgId = await this.resolveOrgId();
    const app = await prisma.jobApplication.findFirst({ where: { id, orgId }, include: { posting: { select: { title: true } } } });
    if (!app) throw new NotFoundException("Application not found");
    if (app.carerId) {
      const existing = await prisma.carer.findUnique({ where: { id: app.carerId }, select: { id: true, name: true } });
      if (existing) return { carer: existing, alreadyConverted: true };
    }
    const carer = await this.carers.create(orgId, {
      name: app.name,
      email: app.email,
      phone: app.phone || undefined,
    } as any);
    const who = await this.actorName(actorId);
    await prisma.jobApplication.update({ where: { id }, data: { carerId: carer.id, status: "hired" } });
    await this.systemNote(orgId, id, `Hired — added to Carers by ${who}`);
    return { carer, alreadyConverted: false };
  }

  async deleteApplication(id: string) {
    const orgId = await this.resolveOrgId();
    const app = await prisma.jobApplication.findFirst({ where: { id, orgId } });
    if (!app) throw new NotFoundException("Application not found");
    await prisma.jobApplication.delete({ where: { id } });
    return { ok: true };
  }

  /* -------------------------------- public ------------------------------- */
  async listOpen() {
    const orgId = await this.resolveOrgId();
    const now = new Date();
    const postings = await prisma.jobPosting.findMany({
      where: { orgId, status: "open", OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
      orderBy: [{ postedAt: "desc" }],
      select: {
        title: true, slug: true, department: true, location: true,
        employmentType: true, summary: true, salaryRange: true, postedAt: true, closesAt: true,
      },
    });
    return { postings };
  }

  async getOpenBySlug(slug: string) {
    const orgId = await this.resolveOrgId();
    const now = new Date();
    const posting = await prisma.jobPosting.findFirst({
      where: { orgId, slug, status: "open", OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
      select: {
        id: true, title: true, slug: true, department: true, location: true,
        employmentType: true, summary: true, description: true, requirements: true,
        salaryRange: true, postedAt: true, closesAt: true,
      },
    });
    if (!posting) throw new NotFoundException("Role not found");
    return posting;
  }

  async apply(slug: string, data: { name?: string; email?: string; phone?: string; coverNote?: string }, cv?: { url: string; fileName: string }) {
    const posting = await this.getOpenBySlug(slug);
    const orgId = await this.resolveOrgId();
    const name = (data.name || "").trim();
    const email = (data.email || "").trim();
    if (!name) throw new BadRequestException("Name is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("A valid email is required");

    // One application per email per role — repeat submissions update the original.
    const existing = await prisma.jobApplication.findFirst({
      where: { orgId, postingId: posting.id, email: { equals: email, mode: "insensitive" } },
    });
    const fields = {
      name,
      email,
      phone: data.phone?.trim() || null,
      coverNote: data.coverNote?.trim() || null,
      ...(cv ? { cvUrl: cv.url, cvFileName: cv.fileName } : {}),
    };
    if (existing) {
      await prisma.jobApplication.update({ where: { id: existing.id }, data: fields });
      await this.systemNote(orgId, existing.id, "Candidate re-submitted their application via the website");
      return { ok: true, updated: true };
    }
    const created = await prisma.jobApplication.create({ data: { orgId, postingId: posting.id, ...fields } });
    await this.systemNote(orgId, created.id, "Applied via the website careers page");
    this.notifyAdminsOfApplication(orgId, name, posting.title, created.id).catch((e) =>
      this.logger.warn(`Admin notification failed: ${e?.message || e}`),
    );
    this.sendAcknowledgement(orgId, created.id, name, email, posting.title).catch((e) =>
      this.logger.warn(`Acknowledgement email failed: ${e?.message || e}`),
    );
    return { ok: true };
  }

  // Best-effort thank-you email so candidates aren't left wondering.
  private async sendAcknowledgement(orgId: string, applicationId: string, name: string, to: string, roleTitle: string) {
    const firstName = name.split(/\s+/)[0];
    const subject = `We received your application — ${roleTitle} at PoolCare`;
    const body =
      `Hi ${firstName},\n\n` +
      `Thanks for applying for the ${roleTitle} role at PoolCare. Your application is in — our team reviews every one, and we'll be in touch if there's a fit.\n\n` +
      `In the meantime, you can learn more about how we work at https://poolcare.africa/about.\n\n` +
      `— The PoolCare team`;
    await this.email.send(to, subject, body, undefined, orgId);
    await this.systemNote(orgId, applicationId, "Acknowledgement email sent to candidate");
  }

  // Push a heads-up to every ADMIN/MANAGER so applications don't rot unseen.
  private async notifyAdminsOfApplication(orgId: string, candidate: string, roleTitle: string, applicationId: string) {
    const admins = await prisma.orgMember.findMany({
      where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
      select: { userId: true },
      distinct: ["userId"],
    });
    await Promise.allSettled(
      admins.map((m) =>
        this.push.sendToUser(m.userId, orgId, "New job application", `${candidate} applied for ${roleTitle}`, {
          type: "job_application",
          applicationId,
        }),
      ),
    );
  }
}
