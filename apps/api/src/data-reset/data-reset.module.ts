import { Module } from "@nestjs/common";
import { DataResetController } from "./data-reset.controller";
import { DataResetService } from "./data-reset.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [DataResetController],
  providers: [DataResetService],
})
export class DataResetModule {}
