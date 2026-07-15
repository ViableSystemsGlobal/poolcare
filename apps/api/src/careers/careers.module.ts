import { Module } from "@nestjs/common";
import { CareersController } from "./careers.controller";
import { PublicCareersController } from "./public-careers.controller";
import { CareersService } from "./careers.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { CarersModule } from "../carers/carers.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, FilesModule, CarersModule, NotificationsModule],
  controllers: [CareersController, PublicCareersController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
