import { Module } from "@nestjs/common";
import { PoolsController } from "./pools.controller";
import { PoolsService } from "./pools.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { MapsModule } from "../maps/maps.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [AuthModule, FilesModule, MapsModule, SettingsModule],
  controllers: [PoolsController],
  providers: [PoolsService],
  exports: [PoolsService],
})
export class PoolsModule {}

