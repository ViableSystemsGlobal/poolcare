import { Controller, Get, Param, Query } from "@nestjs/common";
import { BlogService } from "./blog.service";

// Public blog read — NO auth (the marketing site reads this).
@Controller("public/blog")
export class PublicBlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(@Query("limit") limit?: string, @Query("tag") tag?: string, @Query("type") type?: string) {
    return this.blog.listPublished({ limit: limit ? parseInt(limit, 10) : undefined, tag, type });
  }

  @Get(":slug")
  get(@Param("slug") slug: string) {
    return this.blog.getPublishedBySlug(slug);
  }
}
