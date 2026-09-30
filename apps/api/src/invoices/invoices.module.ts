import { Module, forwardRef } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlansModule } from "../plans/plans.module";
import { QuotesModule } from "../quotes/quotes.module";

@Module({
  imports: [AuthModule, NotificationsModule, forwardRef(() => PlansModule), forwardRef(() => QuotesModule)],
  controllers: [InvoicesController],
  providers: [InvoicesService, PaymentsService],
  exports: [InvoicesService, PaymentsService],
})
export class InvoicesModule {}
