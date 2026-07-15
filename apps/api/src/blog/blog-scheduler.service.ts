import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BlogService } from "./blog.service";

/**
 * Auto-generates a blog post from the topic queue on the configured cadence
 * (default daily). By default drafts wait in the review queue; when the org
 * enables autoPublish, the generated post goes live immediately.
 */
@Injectable()
export class BlogSchedulerService {
  private readonly logger = new Logger("BlogScheduler");
  constructor(private readonly blog: BlogService) {}

  // Runs daily at 09:00; respects the per-org cadence (cadenceDays).
  @Cron("0 9 * * *")
  async tick() {
    try {
      const settings = await this.blog.getSettings();
      if (!settings.autoGenerate) return;

      const cadence = Math.max(1, settings.cadenceDays || 1);
      const last = settings.lastGeneratedAt ? new Date(settings.lastGeneratedAt) : null;
      const daysSince = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
      if (daysSince < cadence - 0.01) return; // not due yet

      const orgId = await this.blog.resolveOrgId();
      const post = await this.blog.generateFromNextTopic(orgId);
      if (post) {
        await this.blog.updateSettings({ lastGeneratedAt: new Date().toISOString() });
        if (settings.autoPublish) {
          await this.blog.publishPost(post.id);
          this.logger.log(`Auto-generated AND published blog post: "${post.title}"`);
        } else {
          this.logger.log(`Auto-generated blog draft: "${post.title}"`);
        }
      } else {
        this.logger.warn("Blog auto-generate skipped: no pending topics in the queue.");
      }
    } catch (e: any) {
      this.logger.error(`Blog auto-generate failed: ${e?.message ?? e}`);
    }
  }
}
