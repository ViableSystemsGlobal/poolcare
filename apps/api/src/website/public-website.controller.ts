import { Controller, Get, Param } from "@nestjs/common";
import { WebsiteService } from "./website.service";

// Public read of published website content — NO auth guard (the marketing site reads this).
@Controller("public/website")
export class PublicWebsiteController {
  constructor(private readonly website: WebsiteService) {}

  // All published docs as a { key: content } map — for server-side preloading.
  @Get()
  getAll() {
    return this.website.getAllPublished();
  }

  @Get(":key")
  get(@Param("key") key: string) {
    return this.website.getPublished(key);
  }
}
