import { Module } from "@nestjs/common";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, FilesModule, NotificationsModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}

