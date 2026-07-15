import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CareersService } from "./careers.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

// Admin Careers management (job postings + applications).
@Controller("careers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Get("postings")
  listPostings(@Query("status") status?: string) {
    return this.careers.listPostings(status);
  }

  @Get("stats")
  stats() {
    return this.careers.getStats();
  }

  @Get("postings/:id")
  getPosting(@Param("id") id: string) {
    return this.careers.getPosting(id);
  }

  @Post("postings")
  createPosting(@Body() body: any) {
    return this.careers.createPosting(body);
  }

  @Patch("postings/:id")
  updatePosting(@Param("id") id: string, @Body() body: any) {
    return this.careers.updatePosting(id, body);
  }

  @Delete("postings/:id")
  deletePosting(@Param("id") id: string) {
    return this.careers.deletePosting(id);
  }

  @Get("applications")
  listApplications(@Query("postingId") postingId?: string, @Query("status") status?: string) {
    return this.careers.listApplications({ postingId, status });
  }

  @Get("applications/:id")
  getApplication(@Param("id") id: string) {
    return this.careers.getApplication(id);
  }

  @Patch("applications/:id")
  updateApplication(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() body: { status?: string; notes?: string },
  ) {
    return this.careers.updateApplication(id, body, user?.sub);
  }

  @Post("applications/:id/comments")
  addComment(@CurrentUser() user: { sub: string }, @Param("id") id: string, @Body() body: { body: string }) {
    return this.careers.addComment(id, user.sub, body?.body);
  }

  @Put("applications/:id/review")
  setReview(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() body: { verdict?: string; rating?: number | null; scores?: Record<string, number> | null },
  ) {
    return this.careers.setReview(id, user.sub, body);
  }

  @Post("applications/:id/email")
  emailCandidate(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() body: { subject?: string; body?: string },
  ) {
    return this.careers.emailCandidate(id, user.sub, body);
  }

  @Post("applications/:id/hire")
  hire(@CurrentUser() user: { sub: string }, @Param("id") id: string) {
    return this.careers.hireToCarer(id, user?.sub);
  }

  @Delete("applications/:id")
  deleteApplication(@Param("id") id: string) {
    return this.careers.deleteApplication(id);
  }
}
