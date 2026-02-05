import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { OrgsService } from "./orgs.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { InviteMemberDto, UpdateMemberRoleDto } from "./dto";

@Controller("orgs")
@UseGuards(JwtAuthGuard)
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Get("me")
  async getMe(@CurrentUser() user: { org_id: string; sub: string; role: string }) {
    return this.orgsService.getMe(user.org_id, user.sub, user.role);
  }

  @Get("members")
  async listMembers(@CurrentUser() user: { org_id: string; role: string }) {
    return this.orgsService.listMembers(user.org_id, user.role);
  }

  @Post("members")
  async inviteMember(@CurrentUser() user: { org_id: string; role: string }, @Body() dto: InviteMemberDto) {
    return this.orgsService.inviteMember(user.org_id, user.role, dto);
  }

  @Patch("members/:userId")
  async updateMemberRole(
    @CurrentUser() user: { org_id: string; role: string },
    @Param("userId") userId: string,
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.orgsService.updateMemberRole(user.org_id, user.role, userId, dto);
  }

  @Delete("members/:userId")
  async removeMember(
    @CurrentUser() user: { org_id: string; role: string },
    @Param("userId") userId: string
  ) {
    return this.orgsService.removeMember(user.org_id, user.role, userId);
  }
}

