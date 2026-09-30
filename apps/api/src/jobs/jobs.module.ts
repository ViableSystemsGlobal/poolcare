import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { DispatchService } from "./dispatch.service";
import { AuthModule } from "../auth/auth.module";
import { MapsModule } from "../maps/maps.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SettingsModule } from "../settings/settings.module";
import { FilesModule } from "../files/files.module";

@Module({
  imports: [AuthModule, FilesModule, MapsModule, NotificationsModule, SettingsModule],
  controllers: [JobsController],
  providers: [JobsService, DispatchService],
  exports: [JobsService, DispatchService],
})
export class JobsModule {}

