import { Module } from "@nestjs/common";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, JobsModule, NotificationsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}

