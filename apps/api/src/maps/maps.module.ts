import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MapsService } from "./maps.service";
import { MapsController } from "./maps.controller";
import { AuthModule } from "../auth/auth.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [ConfigModule, AuthModule, forwardRef(() => SettingsModule)],
  providers: [MapsService],
  controllers: [MapsController],
  exports: [MapsService],
})
export class MapsModule {}

