import { Module } from "@nestjs/common";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";
import { FilesModule } from "../files/files.module";

@Module({
  imports: [FilesModule],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}

