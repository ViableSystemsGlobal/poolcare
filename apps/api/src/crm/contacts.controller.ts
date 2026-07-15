import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from "@nestjs/common";
import { ContactsService } from "./contacts.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateContactDto, UpdateContactDto, SendMessageDto } from "./dto";

@Controller("crm/contacts")
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @CurrentUser() user: { org_id: string },
    @Query("query") query?: string,
    @Query("accountId") accountId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.contacts.list(user.org_id, {
      query,
      accountId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  getOne(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.contacts.getOne(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateContactDto) {
    return this.contacts.create(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  update(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  remove(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.contacts.remove(user.org_id, id);
  }

  @Post(":id/message")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  sendMessage(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string,
    @Body() dto: SendMessageDto
  ) {
    return this.contacts.sendMessage(user.org_id, user.sub, id, dto);
  }
}
