import { Module } from "@nestjs/common";
import { TodayController } from "./today.controller";
import { TodayService } from "./today.service";
import { TodayDigestScheduler } from "./today-digest.scheduler";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TodayController],
  providers: [TodayService, TodayDigestScheduler],
  exports: [TodayService],
})
export class TodayModule {}
