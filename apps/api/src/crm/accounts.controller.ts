import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from "@nestjs/common";
import { AccountsService } from "./accounts.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateAccountDto, UpdateAccountDto, SendMessageDto } from "./dto";

@Controller("crm/accounts")
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(
    @CurrentUser() user: { org_id: string },
    @Query("query") query?: string,
    @Query("type") type?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.accounts.list(user.org_id, {
      query,
      type,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  getOne(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.accounts.getOne(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  update(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  remove(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.accounts.remove(user.org_id, id);
  }

  @Post(":id/convert-to-client")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  convertToClient(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.accounts.convertToClient(user.org_id, id);
  }

  @Post(":id/message")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  sendMessage(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: SendMessageDto
  ) {
    return this.accounts.sendMessage(user.org_id, user.sub, id, dto);
  }
}
