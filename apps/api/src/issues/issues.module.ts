import { Module } from "@nestjs/common";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}

