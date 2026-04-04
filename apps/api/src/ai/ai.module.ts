import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { DosingCoachService } from "./services/dosing-coach.service";
import { SmartRepliesService } from "./services/smart-replies.service";
import { RecommendationsService } from "./services/recommendations.service";
import { BusinessPartnerService } from "./services/business-partner.service";
import { PoolCoachService } from "./services/pool-coach.service";
import { NewsletterAgentService } from "./services/newsletter-agent.service";
import { TipSchedulerService } from "./services/tip-scheduler.service";
import { HelpAssistantService } from "./services/help-assistant.service";
import { AuthModule } from "../auth/auth.module";
import { SettingsModule } from "../settings/settings.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";

@Module({
  imports: [AuthModule, SettingsModule, NotificationsModule, KnowledgeModule],
  controllers: [AiController],
  providers: [
    AiService,
    DosingCoachService,
    SmartRepliesService,
    RecommendationsService,
    BusinessPartnerService,
    PoolCoachService,
    NewsletterAgentService,
    TipSchedulerService,
    HelpAssistantService,
  ],
  exports: [
    AiService,
    DosingCoachService,
    SmartRepliesService,
    RecommendationsService,
    BusinessPartnerService,
    PoolCoachService,
    NewsletterAgentService,
    TipSchedulerService,
    HelpAssistantService,
  ],
})
export class AiModule {}

