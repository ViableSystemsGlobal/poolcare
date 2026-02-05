import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AiService } from "./ai.service";
import { DosingCoachService } from "./services/dosing-coach.service";
import { SmartRepliesService } from "./services/smart-replies.service";
import { RecommendationsService } from "./services/recommendations.service";
import { BusinessPartnerService } from "./services/business-partner.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  DosingSuggestDto,
  SuggestRepliesDto,
  DispatchOptimizeDto,
  BusinessPartnerChatDto,
} from "./dto";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly dosingCoachService: DosingCoachService,
    private readonly smartRepliesService: SmartRepliesService,
    private readonly recommendationsService: RecommendationsService,
    private readonly businessPartnerService: BusinessPartnerService
  ) {}

  @Get("recommendations")
  async getRecommendations(
    @CurrentUser() user: { org_id: string },
    @Query("context") context?: "dashboard" | "jobs" | "invoices" | "visits" | "carers"
  ) {
    return this.recommendationsService.getRecommendations(
      user.org_id,
      context || "dashboard"
    );
  }

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

  @Post("business-partner/chat")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async businessPartnerChat(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: BusinessPartnerChatDto
  ) {
    return this.businessPartnerService.chat(user.org_id, user.sub, {
      conversationId: dto.conversationId,
      messages: dto.messages,
    });
  }

  @Get("business-partner/chats")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async listBusinessPartnerChats(@CurrentUser() user: { org_id: string; sub: string }) {
    return this.businessPartnerService.listChats(user.org_id, user.sub);
  }

  @Get("business-partner/chats/:id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getBusinessPartnerChat(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string
  ) {
    return this.businessPartnerService.getChat(user.org_id, user.sub, id);
  }

  @Delete("business-partner/chats/:id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async deleteBusinessPartnerChat(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string
  ) {
    return this.businessPartnerService.deleteChat(user.org_id, user.sub, id);
  }
}

