import { Module, forwardRef } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

