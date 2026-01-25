import { Module } from "@nestjs/common";
import { MobileController } from "./mobile.controller";
import { MobileService } from "./mobile.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}

