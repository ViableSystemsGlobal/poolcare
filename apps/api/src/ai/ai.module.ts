import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { DosingCoachService } from "./services/dosing-coach.service";
import { SmartRepliesService } from "./services/smart-replies.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, DosingCoachService, SmartRepliesService],
  exports: [AiService, DosingCoachService, SmartRepliesService],
})
export class AiModule {}

