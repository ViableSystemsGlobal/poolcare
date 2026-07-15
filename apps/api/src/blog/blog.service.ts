import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { AiService } from "../ai/ai.service";

const slugify = (s: string) =>
  (s || "").toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);

export interface BlogSettings {
  autoGenerate: boolean;
  /** When true, scheduler-generated posts go live immediately (no review). */
  autoPublish: boolean;
  cadenceDays: number;
  lastGeneratedAt: string | null;
}
const DEFAULT_SETTINGS: BlogSettings = { autoGenerate: false, autoPublish: false, cadenceDays: 1, lastGeneratedAt: null };

@Injectable()
export class BlogService {
  constructor(private readonly ai: AiService) {}

  // Single-tenant org (matches the website CMS / public site).
  async resolveOrgId(): Promise<string> {
    const pinned = process.env.DEFAULT_ORG_ID;
    if (pinned) {
      const org = await prisma.organization.findUnique({ where: { id: pinned }, select: { id: true } });
      if (org) return org.id;
    }
    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!org) throw new NotFoundException("No organization configured");
    return org.id;
  }

  private async uniqueSlug(orgId: string, base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || "post";
    let slug = root;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await prisma.blogPost.findFirst({ where: { orgId, slug, NOT: excludeId ? { id: excludeId } : undefined }, select: { id: true } });
      if (!clash) return slug;
      n += 1;
      slug = `${root}-${n}`;
    }
  }

  /* -------------------------------- posts -------------------------------- */
  async listPosts(status?: string, type?: string) {
    const orgId = await this.resolveOrgId();
    return prisma.blogPost.findMany({
      where: { orgId, ...(status ? { status } : {}), ...(type ? { type } : {}) },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
  }

  async getPost(id: string) {
    const orgId = await this.resolveOrgId();
    const post = await prisma.blogPost.findFirst({ where: { id, orgId } });
    if (!post) throw new NotFoundException("Post not found");
    return post;
  }

  async createPost(data: any) {
    const orgId = await this.resolveOrgId();
    const slug = await this.uniqueSlug(orgId, data.slug || data.title || "post");
    return prisma.blogPost.create({
      data: {
        orgId,
        type: data.type === "case-study" ? "case-study" : "article",
        title: data.title || "Untitled post",
        slug,
        excerpt: data.excerpt ?? null,
        body: data.body || "",
        coverImage: data.coverImage ?? null,
        client: data.client ?? null,
        beforeImage: data.beforeImage ?? null,
        afterImage: data.afterImage ?? null,
        outcome: data.outcome ?? null,
        status: data.status || "draft",
        author: data.author || "PoolCare",
        aiGenerated: !!data.aiGenerated,
        seoTitle: data.seoTitle ?? null,
        seoDescription: data.seoDescription ?? null,
        ogImage: data.ogImage ?? null,
        tags: Array.isArray(data.tags) ? data.tags : [],
      },
    });
  }

  async updatePost(id: string, data: any) {
    const orgId = await this.resolveOrgId();
    await this.getPost(id); // ensure exists in org
    const patch: any = {};
    for (const k of ["type", "title", "excerpt", "body", "coverImage", "client", "beforeImage", "afterImage", "outcome", "status", "author", "seoTitle", "seoDescription", "ogImage", "tags", "scheduledFor"]) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.slug !== undefined) patch.slug = await this.uniqueSlug(orgId, data.slug, id);
    return prisma.blogPost.update({ where: { id }, data: patch });
  }

  async deletePost(id: string) {
    await this.getPost(id);
    await prisma.blogPost.delete({ where: { id } });
    return { ok: true };
  }

  async publishPost(id: string) {
    const post = await this.getPost(id);
    return prisma.blogPost.update({
      where: { id },
      data: { status: "published", publishedAt: post.publishedAt ?? new Date() },
    });
  }

  async unpublishPost(id: string) {
    await this.getPost(id);
    return prisma.blogPost.update({ where: { id }, data: { status: "draft" } });
  }

  /* -------------------------------- topics ------------------------------- */
  async listTopics() {
    const orgId = await this.resolveOrgId();
    return prisma.blogTopic.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  }
  async addTopic(topic: string, keywords?: string) {
    const orgId = await this.resolveOrgId();
    if (!topic?.trim()) throw new BadRequestException("Topic is required");
    return prisma.blogTopic.create({ data: { orgId, topic: topic.trim(), keywords: keywords || null } });
  }
  async deleteTopic(id: string) {
    const orgId = await this.resolveOrgId();
    await prisma.blogTopic.deleteMany({ where: { id, orgId } });
    return { ok: true };
  }

  /* ------------------------------- settings ------------------------------ */
  async getSettings(): Promise<BlogSettings> {
    const orgId = await this.resolveOrgId();
    const os = await prisma.orgSetting.findUnique({ where: { orgId }, select: { integrations: true } });
    const blog = ((os?.integrations as any) || {}).blog || {};
    return { ...DEFAULT_SETTINGS, ...blog };
  }
  async updateSettings(data: Partial<BlogSettings>) {
    const orgId = await this.resolveOrgId();
    const os = await prisma.orgSetting.upsert({
      where: { orgId },
      create: { orgId, integrations: { blog: { ...DEFAULT_SETTINGS, ...data } } },
      update: {},
      select: { integrations: true },
    });
    const integrations = (os.integrations as any) || {};
    const next = { ...DEFAULT_SETTINGS, ...(integrations.blog || {}), ...data };
    await prisma.orgSetting.update({ where: { orgId }, data: { integrations: { ...integrations, blog: next } } });
    return next;
  }

  /* ------------------------------- generate ------------------------------ */
  async generate(orgId: string, opts: { topic: string; keywords?: string; topicId?: string }) {
    const gen = await this.ai.generateBlogPost(orgId, opts.topic, opts.keywords);
    const slug = await this.uniqueSlug(orgId, gen.slug || gen.title);
    const post = await prisma.blogPost.create({
      data: {
        orgId, title: gen.title, slug, excerpt: gen.excerpt, body: gen.body,
        seoTitle: gen.seoTitle, seoDescription: gen.seoDescription, tags: gen.tags,
        status: "draft", aiGenerated: true, author: "PoolCare AI",
      },
    });
    if (opts.topicId) {
      await prisma.blogTopic.update({ where: { id: opts.topicId }, data: { status: "used", usedAt: new Date(), postId: post.id } });
    }
    return post;
  }

  // Used by the manual "Generate" button and by the scheduler.
  async generateFromTopicId(topicId: string) {
    const orgId = await this.resolveOrgId();
    const topic = await prisma.blogTopic.findFirst({ where: { id: topicId, orgId } });
    if (!topic) throw new NotFoundException("Topic not found");
    return this.generate(orgId, { topic: topic.topic, keywords: topic.keywords || undefined, topicId: topic.id });
  }

  async generateAdhoc(topic: string, keywords?: string) {
    const orgId = await this.resolveOrgId();
    return this.generate(orgId, { topic, keywords });
  }

  async generateFromNextTopic(orgId: string) {
    const topic = await prisma.blogTopic.findFirst({ where: { orgId, status: "pending" }, orderBy: { createdAt: "asc" } });
    if (!topic) return null;
    return this.generate(orgId, { topic: topic.topic, keywords: topic.keywords || undefined, topicId: topic.id });
  }

  /* -------------------------------- public ------------------------------- */
  async listPublished(opts: { limit?: number; tag?: string; type?: string } = {}) {
    const orgId = await this.resolveOrgId();
    const posts = await prisma.blogPost.findMany({
      where: { orgId, status: "published", type: opts.type || "article", ...(opts.tag ? { tags: { has: opts.tag } } : {}) },
      orderBy: { publishedAt: "desc" },
      take: opts.limit ?? 50,
      select: {
        title: true, slug: true, excerpt: true, coverImage: true, tags: true, author: true, publishedAt: true,
        client: true, beforeImage: true, afterImage: true, outcome: true,
      },
    });
    return { posts };
  }

  async getPublishedBySlug(slug: string) {
    const orgId = await this.resolveOrgId();
    const post = await prisma.blogPost.findFirst({ where: { orgId, slug, status: "published" } });
    if (!post) throw new NotFoundException("Post not found");
    return post;
  }
}
