import { Module } from "@nestjs/common";
import { CarersController } from "./carers.controller";
import { CarersService } from "./carers.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { MapsModule } from "../maps/maps.module";

@Module({
  imports: [AuthModule, FilesModule, MapsModule],
  controllers: [CarersController],
  providers: [CarersService],
  exports: [CarersService],
})
export class CarersModule {}

