import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { BlogService } from "./blog.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

// Admin Blog management (posts, topics, AI generation, settings).
@Controller("blog")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get("posts")
  listPosts(@Query("status") status?: string, @Query("type") type?: string) {
    return this.blog.listPosts(status, type);
  }

  @Get("posts/:id")
  getPost(@Param("id") id: string) {
    return this.blog.getPost(id);
  }

  @Post("posts")
  createPost(@Body() body: any) {
    return this.blog.createPost(body);
  }

  @Patch("posts/:id")
  updatePost(@Param("id") id: string, @Body() body: any) {
    return this.blog.updatePost(id, body);
  }

  @Delete("posts/:id")
  deletePost(@Param("id") id: string) {
    return this.blog.deletePost(id);
  }

  @Post("posts/:id/publish")
  publish(@Param("id") id: string) {
    return this.blog.publishPost(id);
  }

  @Post("posts/:id/unpublish")
  unpublish(@Param("id") id: string) {
    return this.blog.unpublishPost(id);
  }

  // Topic queue
  @Get("topics")
  listTopics() {
    return this.blog.listTopics();
  }

  @Post("topics")
  addTopic(@Body() body: { topic: string; keywords?: string }) {
    return this.blog.addTopic(body?.topic, body?.keywords);
  }

  @Delete("topics/:id")
  deleteTopic(@Param("id") id: string) {
    return this.blog.deleteTopic(id);
  }

  @Post("topics/:id/generate")
  generateFromTopic(@Param("id") id: string) {
    return this.blog.generateFromTopicId(id);
  }

  // Ad-hoc generation from a typed topic/prompt
  @Post("generate")
  generate(@Body() body: { topic: string; keywords?: string }) {
    return this.blog.generateAdhoc(body?.topic, body?.keywords);
  }

  // Auto-generate settings
  @Get("settings")
  getSettings() {
    return this.blog.getSettings();
  }

  @Put("settings")
  updateSettings(@Body() body: any) {
    return this.blog.updateSettings(body);
  }
}
