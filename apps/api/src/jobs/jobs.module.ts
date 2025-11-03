import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { DispatchService } from "./dispatch.service";

@Module({
  controllers: [JobsController],
  providers: [JobsService, DispatchService],
  exports: [JobsService, DispatchService],
})
export class JobsModule {}

