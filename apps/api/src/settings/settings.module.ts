import { Module, forwardRef } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";

@Module({
  imports: [forwardRef(() => AuthModule), FilesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

