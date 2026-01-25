import { Module, forwardRef } from "@nestjs/common";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";
import { PlansSchedulerService } from "./scheduler.service";
import { AuthModule } from "../auth/auth.module";
import { SubscriptionTemplatesModule } from "../subscription-templates/subscription-templates.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    AuthModule,
    forwardRef(() => SubscriptionTemplatesModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [PlansController],
  providers: [PlansService, PlansSchedulerService],
  exports: [PlansService, PlansSchedulerService],
})
export class PlansModule {}

