import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { AuthModule } from "../auth/auth.module";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [AuthModule, AiModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
