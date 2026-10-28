import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { MailService } from "./mail.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { MailAccountDto, UpdateMailAccountDto, MessageFlagsDto, MoveMessageDto, SendMailDto } from "./dto/mail.dto";

// Connected mailboxes (IMAP/SMTP) for the admin Inbox. Org-wide, admins and managers only.
@Controller("mail")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get("accounts")
  listAccounts(@CurrentUser() user: { org_id: string }) {
    return this.mail.listAccounts(user.org_id);
  }

  @Post("accounts/test")
  test(@Body() dto: MailAccountDto) {
    return this.mail.testConnection(dto);
  }

  @Post("accounts")
  create(@CurrentUser() user: { org_id: string; sub: string }, @Body() dto: MailAccountDto) {
    return this.mail.createAccount(user.org_id, user.sub, dto);
  }

  @Patch("accounts/:id")
  update(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Body() dto: UpdateMailAccountDto) {
    return this.mail.updateAccount(user.org_id, id, dto);
  }

  @Delete("accounts/:id")
  remove(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.mail.deleteAccount(user.org_id, id);
  }

  @Get("accounts/:id/folders")
  folders(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.mail.listFolders(user.org_id, id);
  }

  @Get("accounts/:id/messages")
  messages(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Query("folder") folder?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("unread") unread?: string
  ) {
    return this.mail.listMessages(user.org_id, id, {
      folder: folder || "INBOX",
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      query: q,
      unread: unread === "true",
    });
  }

  @Get("accounts/:id/messages/:uid")
  message(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Param("uid", ParseIntPipe) uid: number,
    @Query("folder") folder?: string
  ) {
    return this.mail.getMessage(user.org_id, id, folder || "INBOX", uid);
  }

  @Get("accounts/:id/messages/:uid/attachments/:index")
  async attachment(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Param("uid", ParseIntPipe) uid: number,
    @Param("index", ParseIntPipe) index: number,
    @Query("folder") folder: string | undefined,
    @Res() res: Response
  ) {
    const att = await this.mail.getAttachment(user.org_id, id, folder || "INBOX", uid, index);
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
    res.send(att.content);
  }

  @Post("accounts/:id/messages/:uid/flags")
  flags(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Param("uid", ParseIntPipe) uid: number,
    @Body() dto: MessageFlagsDto
  ) {
    return this.mail.setFlags(user.org_id, id, uid, dto.folder, { seen: dto.seen, flagged: dto.flagged });
  }

  @Post("accounts/:id/messages/:uid/move")
  move(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Param("uid", ParseIntPipe) uid: number,
    @Body() dto: MoveMessageDto
  ) {
    return this.mail.moveMessage(user.org_id, id, uid, dto.folder, dto.to);
  }

  @Delete("accounts/:id/messages/:uid")
  deleteMessage(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Param("uid", ParseIntPipe) uid: number,
    @Query("folder") folder?: string
  ) {
    return this.mail.deleteMessage(user.org_id, id, uid, folder || "INBOX");
  }

  @Post("accounts/:id/send")
  @UseInterceptors(FilesInterceptor("attachments", 10, { limits: { fileSize: 15 * 1024 * 1024 } }))
  send(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: SendMailDto,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    return this.mail.send(user.org_id, id, dto, files || []);
  }
}
