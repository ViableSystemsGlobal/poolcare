import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { OrgsService } from "./orgs.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
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
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async listMembers(@CurrentUser() user: { org_id: string; role: string }) {
    return this.orgsService.listMembers(user.org_id, user.role);
  }

  @Post("members")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async inviteMember(@CurrentUser() user: { org_id: string; role: string }, @Body() dto: InviteMemberDto) {
    return this.orgsService.inviteMember(user.org_id, user.role, dto);
  }

  @Patch("members/:userId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateMemberRole(
    @CurrentUser() user: { org_id: string; role: string },
    @Param("userId") userId: string,
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.orgsService.updateMemberRole(user.org_id, user.role, userId, dto);
  }

  @Delete("members/:userId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async removeMember(
    @CurrentUser() user: { org_id: string; role: string },
    @Param("userId") userId: string
  ) {
    return this.orgsService.removeMember(user.org_id, user.role, userId);
  }
}

