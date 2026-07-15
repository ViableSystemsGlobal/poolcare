import { Module } from "@nestjs/common";
import { BlogController } from "./blog.controller";
import { PublicBlogController } from "./public-blog.controller";
import { BlogService } from "./blog.service";
import { BlogSchedulerService } from "./blog-scheduler.service";
import { AuthModule } from "../auth/auth.module";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [AuthModule, AiModule],
  controllers: [BlogController, PublicBlogController],
  providers: [BlogService, BlogSchedulerService],
  exports: [BlogService],
})
export class BlogModule {}
