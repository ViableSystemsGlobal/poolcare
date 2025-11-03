import {
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { MobileService } from "./mobile.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("mobile/sync")
@UseGuards(JwtAuthGuard)
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

  @Get()
  async sync(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Query("since") since?: string,
    @Query("shapes") shapes?: string
  ) {
    const shapesArray = shapes ? shapes.split(",") : ["jobs", "pools", "visits"];
    const sinceTimestamp = since ? parseInt(since) : undefined;

    return this.mobileService.getDelta(
      user.org_id,
      user.sub,
      user.role,
      shapesArray,
      sinceTimestamp
    );
  }
}

