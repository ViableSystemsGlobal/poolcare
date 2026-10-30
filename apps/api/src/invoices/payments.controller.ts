import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Res } from "@nestjs/common";
import { Response } from "express";
import { PaymentsService } from "./payments.service";
import { ReceiptsService } from "./receipts.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

// Org-wide payment and receipt lists for the admin console. Recording and
// refunding payments stays on InvoicesController under /invoices/payments.
@Controller("payments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("status") status?: string,
    @Query("method") method?: string,
    @Query("invoiceId") invoiceId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.paymentsService.list(user.org_id, {
      status,
      method,
      invoiceId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post(":id/receipt")
  async ensureReceipt(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.paymentsService.ensureReceipt(user.org_id, id);
  }
}

@Controller("receipts")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("paymentId") paymentId?: string,
    @Query("invoiceId") invoiceId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.receiptsService.list(user.org_id, {
      paymentId,
      invoiceId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  // Must stay ABOVE the ":id" routes so "bulk" isn't read as an id.
  @Delete("bulk")
  async bulkDelete(@CurrentUser() user: { org_id: string }, @Body() body: { ids: string[] }) {
    return this.receiptsService.bulkDelete(user.org_id, body?.ids);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: { org_id: string }, @Param("id") id: string) {
    return this.receiptsService.getOne(user.org_id, id);
  }

  @Get(":id/html")
  async html(@CurrentUser() user: { org_id: string }, @Param("id") id: string, @Res() res: Response) {
    const html = await this.receiptsService.renderHtml(user.org_id, id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }
}
