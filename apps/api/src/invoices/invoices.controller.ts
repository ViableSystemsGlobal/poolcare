import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  SendInvoiceDto,
  InitPaymentDto,
} from "./dto";

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

  @Post("payments/webhook")
  async paymentWebhook(@Body() body: any) {
    return this.paymentsService.handleWebhook(body);
  }
}
