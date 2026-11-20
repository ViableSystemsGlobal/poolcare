import { NotificationsModule } from "../notifications/notifications.module";
import { Module } from "@nestjs/common";
import { PoolsController } from "./pools.controller";
import { PoolsService } from "./pools.service";
import { ClientChemicalStockController } from "./client-chemical-stock.controller";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { MapsModule } from "../maps/maps.module";
import { SettingsModule } from "../settings/settings.module";
import { ClientsModule } from "../clients/clients.module";

@Module({
  imports: [AuthModule, FilesModule, MapsModule, SettingsModule, NotificationsModule, ClientsModule],
  controllers: [PoolsController, ClientChemicalStockController],
  providers: [PoolsService],
  exports: [PoolsService],
})
export class PoolsModule {}

