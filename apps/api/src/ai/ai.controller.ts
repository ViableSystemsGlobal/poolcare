import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { AiService } from "./ai.service";
import { DosingCoachService } from "./services/dosing-coach.service";
import { SmartRepliesService } from "./services/smart-replies.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  DosingSuggestDto,
  SuggestRepliesDto,
  DispatchOptimizeDto,
} from "./dto";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly dosingCoachService: DosingCoachService,
    private readonly smartRepliesService: SmartRepliesService
  ) {}

  @Post("dosing/suggest")
  async suggestDosing(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: DosingSuggestDto
  ) {
    return this.dosingCoachService.suggest(user.org_id, dto);
  }

  @Post("threads/:threadId/suggest-replies")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async suggestReplies(
    @CurrentUser() user: { org_id: string },
    @Param("threadId") threadId: string,
    @Body() dto: SuggestRepliesDto
  ) {
    return this.smartRepliesService.suggest(user.org_id, threadId, dto);
  }

  @Post("dispatch/optimize")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async optimizeDispatch(
    @CurrentUser() user: { org_id: string },
    @Body() dto: DispatchOptimizeDto
  ) {
    return this.aiService.optimizeDispatch(user.org_id, dto);
  }
}

