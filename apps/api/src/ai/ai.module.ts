import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { DosingCoachService } from "./services/dosing-coach.service";
import { SmartRepliesService } from "./services/smart-replies.service";
import { RecommendationsService } from "./services/recommendations.service";
import { BusinessPartnerService } from "./services/business-partner.service";
import { PoolCoachService } from "./services/pool-coach.service";
import { AuthModule } from "../auth/auth.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [AiController],
  providers: [
    AiService,
    DosingCoachService,
    SmartRepliesService,
    RecommendationsService,
    BusinessPartnerService,
    PoolCoachService,
  ],
  exports: [
    AiService,
    DosingCoachService,
    SmartRepliesService,
    RecommendationsService,
    BusinessPartnerService,
    PoolCoachService,
  ],
})
export class AiModule {}

