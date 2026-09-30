import { Module } from "@nestjs/common";
import { AgreementsController } from "./agreements.controller";
import { AgreementsService } from "./agreements.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, FilesModule, NotificationsModule],
  controllers: [AgreementsController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
