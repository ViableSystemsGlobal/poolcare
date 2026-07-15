import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { FilesService } from "../files/files.service";

/**
 * Website CMS content store. Each document is a draft/published pair keyed by
 * `key` (e.g. "plans"). The Studio edits the draft; Publish promotes draft →
 * published; the public marketing site reads only the published copy.
 */
@Injectable()
export class WebsiteService {
  constructor(private readonly files: FilesService) {}

  /** Upload an image for website content (MinIO, with local-disk fallback). */
  async uploadImage(file: Express.Multer.File) {
    const orgId = await this.resolveDefaultOrgId();
    const url = await this.files.uploadImage(orgId, file, "website", orgId);
    return { url };
  }

  /** Previously-uploaded website images, for the Studio's library picker. */
  async listImages() {
    const orgId = await this.resolveDefaultOrgId();
    const images = await this.files.listImages(orgId, "website");
    return { images };
  }
  // Single-tenant org resolution: prefer the explicitly pinned DEFAULT_ORG_ID
  // (the real PoolCare org), falling back to the oldest org if unset.
  private async resolveDefaultOrgId(): Promise<string> {
    const pinned = process.env.DEFAULT_ORG_ID;
    if (pinned) {
      const org = await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true } });
      if (org) return org.id;
    }
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!org) throw new NotFoundException("No organization configured");
    return org.id;
  }

  private hasUnpublished(draft: unknown, published: unknown): boolean {
    return JSON.stringify(draft ?? null) !== JSON.stringify(published ?? null);
  }

  /** Public: the live, published content for a key (null until first publish). */
  async getPublished(key: string) {
    const orgId = await this.resolveDefaultOrgId();
    const doc = await prisma.websiteContent.findUnique({
      where: { orgId_key: { orgId, key } },
    });
    return { key, content: doc?.published ?? null, publishedAt: doc?.publishedAt ?? null };
  }

  /**
   * Public: every published doc as a `{ key: content }` map. The marketing site
   * preloads this server-side so pages server-render the live published copy
   * (good for SEO/AIEO) instead of the bundled fallback.
   */
  async getAllPublished() {
    const orgId = await this.resolveDefaultOrgId();
    const docs = await prisma.websiteContent.findMany({
      where: { orgId },
      select: { key: true, published: true },
    });
    const map: Record<string, unknown> = {};
    for (const d of docs) if (d.published != null) map[d.key] = d.published;
    return { content: map };
  }

  /** Admin: the draft + published + status for the Studio. */
  async getDraft(key: string) {
    const orgId = await this.resolveDefaultOrgId();
    const doc = await prisma.websiteContent.findUnique({
      where: { orgId_key: { orgId, key } },
    });
    return {
      key,
      draft: doc?.draft ?? null,
      published: doc?.published ?? null,
      publishedAt: doc?.publishedAt ?? null,
      updatedAt: doc?.updatedAt ?? null,
      hasUnpublishedChanges: doc ? this.hasUnpublished(doc.draft, doc.published) : false,
    };
  }

  /** Admin: list all content documents with their publish status. */
  async list() {
    const orgId = await this.resolveDefaultOrgId();
    const docs = await prisma.websiteContent.findMany({
      where: { orgId },
      select: { key: true, publishedAt: true, updatedAt: true, draft: true, published: true },
    });
    return docs.map((d) => ({
      key: d.key,
      publishedAt: d.publishedAt,
      updatedAt: d.updatedAt,
      hasUnpublishedChanges: this.hasUnpublished(d.draft, d.published),
    }));
  }

  /** Admin: save (upsert) the working draft. */
  async saveDraft(key: string, draft: unknown, userId?: string) {
    const orgId = await this.resolveDefaultOrgId();
    const doc = await prisma.websiteContent.upsert({
      where: { orgId_key: { orgId, key } },
      create: { orgId, key, draft: draft as any, updatedById: userId ?? null },
      update: { draft: draft as any, updatedById: userId ?? null },
    });
    return { ok: true, updatedAt: doc.updatedAt };
  }

  /** Admin: promote the current draft to published. */
  async publish(key: string, userId?: string) {
    const orgId = await this.resolveDefaultOrgId();
    const doc = await prisma.websiteContent.findUnique({
      where: { orgId_key: { orgId, key } },
    });
    if (!doc) throw new NotFoundException(`No content to publish for "${key}"`);
    const updated = await prisma.websiteContent.update({
      where: { orgId_key: { orgId, key } },
      data: { published: doc.draft as any, publishedAt: new Date(), updatedById: userId ?? null },
    });
    return { ok: true, publishedAt: updated.publishedAt };
  }

  /** Admin: discard the draft, reverting it to the published copy. */
  async revertDraft(key: string) {
    const orgId = await this.resolveDefaultOrgId();
    const doc = await prisma.websiteContent.findUnique({
      where: { orgId_key: { orgId, key } },
    });
    if (!doc || doc.published == null) throw new NotFoundException("Nothing published to revert to");
    const updated = await prisma.websiteContent.update({
      where: { orgId_key: { orgId, key } },
      data: { draft: doc.published as any },
    });
    return { ok: true, updatedAt: updated.updatedAt };
  }
}
