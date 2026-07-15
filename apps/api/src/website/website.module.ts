import { Module } from "@nestjs/common";
import { WebsiteController } from "./website.controller";
import { PublicWebsiteController } from "./public-website.controller";
import { WebsiteService } from "./website.service";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [WebsiteController, PublicWebsiteController],
  providers: [WebsiteService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
