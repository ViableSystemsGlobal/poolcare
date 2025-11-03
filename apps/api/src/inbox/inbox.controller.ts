import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { InboxService } from "./inbox.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  SendMessageDto,
  LinkThreadDto,
  SuggestRepliesDto,
} from "./dto";

@Controller("threads")
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("folder") folder?: string,
    @Query("clientId") clientId?: string,
    @Query("tag") tag?: string,
    @Query("query") query?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.inboxService.list(user.org_id, user.role, user.sub, {
      folder,
      clientId,
      tag,
      query,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.inboxService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Post(":id/messages")
  async sendMessage(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") threadId: string,
    @Body() dto: SendMessageDto
  ) {
    return this.inboxService.sendMessage(user.org_id, user.role, user.sub, threadId, dto);
  }

  @Post(":id/read")
  async markRead(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.inboxService.markRead(user.org_id, user.role, user.sub, id);
  }

  @Post(":id/archive")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async archive(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inboxService.archive(user.org_id, id);
  }

  @Post(":id/unarchive")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async unarchive(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inboxService.unarchive(user.org_id, id);
  }

  @Post(":id/link")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async linkThread(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: LinkThreadDto
  ) {
    return this.inboxService.linkThread(user.org_id, id, dto);
  }

  @Get(":id/links")
  async getLinks(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.inboxService.getLinks(user.org_id, user.role, user.sub, id);
  }

  @Post(":id/suggest-replies")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async suggestReplies(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: SuggestRepliesDto
  ) {
    return this.inboxService.suggestReplies(user.org_id, id, dto);
  }
}

