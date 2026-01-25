import { Module, forwardRef } from "@nestjs/common";
import { SubscriptionTemplatesController } from "./subscription-templates.controller";
import { SubscriptionTemplatesService } from "./subscription-templates.service";
import { AuthModule } from "../auth/auth.module";
import { PlansModule } from "../plans/plans.module";

@Module({
  imports: [
    AuthModule,
    forwardRef(() => PlansModule),
  ],
  controllers: [SubscriptionTemplatesController],
  providers: [SubscriptionTemplatesService],
  exports: [SubscriptionTemplatesService],
})
export class SubscriptionTemplatesModule {}

