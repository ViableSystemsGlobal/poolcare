import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Headers,
} from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  SendInvoiceDto,
  InitPaymentDto,
  CreateCreditNoteDto,
} from "./dto";
import { CreateRefundDto } from "./dto";

@Controller("invoices")
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(@CurrentUser() user: { org_id: string }, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user.org_id, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Query("clientId") clientId?: string,
    @Query("poolId") poolId?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.invoicesService.list(user.org_id, user.role, user.sub, {
      clientId,
      poolId,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.invoicesService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateInvoiceDto
  ) {
    return this.invoicesService.update(user.org_id, id, dto);
  }

  @Post(":id/send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async send(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: SendInvoiceDto
  ) {
    return this.invoicesService.send(user.org_id, id, dto);
  }

  @Post(":id/payments/init")
  async initPayment(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string,
    @Body() dto: InitPaymentDto
  ) {
    return this.paymentsService.init(user.org_id, user.role, user.sub, id, dto);
  }

  @Post("payments")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async createManualPayment(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Body() dto: { invoiceId: string; method: string; amountCents: number; reference?: string }
  ) {
    return this.paymentsService.createManual(user.org_id, user.role, user.sub, dto);
  }

  @Public()
  @Post("payments/webhook")
  async paymentWebhook(@Body() body: any, @Headers("x-paystack-signature") signature?: string) {
    return this.paymentsService.handleWebhook(body, signature);
  }

  @Post("credit-notes")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async createCreditNote(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateCreditNoteDto
  ) {
    return this.invoicesService.createCreditNote(user.org_id, dto);
  }

  @Get("credit-notes")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async listCreditNotes(
    @CurrentUser() user: { org_id: string },
    @Query("clientId") clientId?: string,
    @Query("invoiceId") invoiceId?: string
  ) {
    return this.invoicesService.listCreditNotes(user.org_id, clientId, invoiceId);
  }

  @Post("credit-notes/:id/apply")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async applyCreditNote(
    @CurrentUser() user: { org_id: string },
    @Param("id") creditNoteId: string,
    @Body() body: { invoiceId: string }
  ) {
    return this.invoicesService.applyCreditNote(user.org_id, creditNoteId, body.invoiceId);
  }

  @Post("payments/refund")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async createRefund(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Body() dto: CreateRefundDto
  ) {
    return this.paymentsService.createRefund(user.org_id, user.role, user.sub, dto);
  }

  @Get("payments/refunds")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async listRefunds(
    @CurrentUser() user: { org_id: string },
    @Query("paymentId") paymentId?: string
  ) {
    return this.paymentsService.listRefunds(user.org_id, paymentId);
  }
}
