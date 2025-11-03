import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { VisitsService } from "./visits.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AddReadingDto,
  AddChemicalDto,
  CommitPhotoDto,
  CompleteVisitDto,
} from "./dto";

@Controller("visits")
@UseGuards(JwtAuthGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.visitsService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Post(":id/readings")
  async addReading(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: AddReadingDto
  ) {
    return this.visitsService.addReading(user.org_id, user.sub, visitId, dto);
  }

  @Post(":id/chemicals")
  async addChemical(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: AddChemicalDto
  ) {
    return this.visitsService.addChemical(user.org_id, user.sub, visitId, dto);
  }

  @Post(":id/photos/presign")
  async presignPhoto(
    @CurrentUser() user: { org_id: string },
    @Param("id") visitId: string,
    @Body() body: { contentType: string; fileName?: string }
  ) {
    return this.visitsService.presignPhoto(user.org_id, visitId, body);
  }

  @Post(":id/photos/commit")
  async commitPhoto(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: CommitPhotoDto
  ) {
    return this.visitsService.commitPhoto(user.org_id, user.sub, visitId, dto);
  }

  @Post(":id/complete")
  async complete(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") visitId: string,
    @Body() dto: CompleteVisitDto
  ) {
    return this.visitsService.complete(user.org_id, user.sub, visitId, dto);
  }
}

