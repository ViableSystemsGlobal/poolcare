import { Module, forwardRef } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";
import { ReceiptsService } from "./receipts.service";
import { PaymentsController, ReceiptsController } from "./payments.controller";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlansModule } from "../plans/plans.module";
import { QuotesModule } from "../quotes/quotes.module";

@Module({
  imports: [AuthModule, NotificationsModule, forwardRef(() => PlansModule), forwardRef(() => QuotesModule)],
  controllers: [InvoicesController, PaymentsController, ReceiptsController],
  providers: [InvoicesService, PaymentsService, ReceiptsService],
  exports: [InvoicesService, PaymentsService],
})
export class InvoicesModule {}
