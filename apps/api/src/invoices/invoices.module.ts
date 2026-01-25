import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, PaymentsService],
  exports: [InvoicesService, PaymentsService],
})
export class InvoicesModule {}
