import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import { AiService } from "./ai.service";
import { DosingCoachService } from "./services/dosing-coach.service";
import { SmartRepliesService } from "./services/smart-replies.service";
import { RecommendationsService } from "./services/recommendations.service";
import { BusinessPartnerService } from "./services/business-partner.service";
import { PoolCoachService } from "./services/pool-coach.service";
import { NewsletterAgentService } from "./services/newsletter-agent.service";
import { TipSchedulerService } from "./services/tip-scheduler.service";
import { HelpAssistantService } from "./services/help-assistant.service";
import { DailyBriefingService } from "./services/daily-briefing.service";
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
    private readonly businessPartnerService: BusinessPartnerService,
    private readonly poolCoachService: PoolCoachService,
    private readonly newsletterAgentService: NewsletterAgentService,
    private readonly tipSchedulerService: TipSchedulerService,
    private readonly helpAssistantService: HelpAssistantService,
    private readonly dailyBriefingService: DailyBriefingService
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

  @Get("visits/:visitId/summary")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CARER")
  async summarizeVisit(
    @CurrentUser() user: { org_id: string },
    @Param("visitId") visitId: string
  ) {
    return this.aiService.summarizeVisit(user.org_id, visitId);
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

  /** Help assistant — ephemeral chat for admin system guidance, all authenticated users */
  @Post("help/chat")
  async helpChat(
    @CurrentUser() user: { org_id: string },
    @Body() dto: BusinessPartnerChatDto
  ) {
    return this.helpAssistantService.chat(user.org_id, dto.messages);
  }

  /** Client-facing pool care assistant — available to all authenticated roles */
  @Post("pool-coach/chat")
  async poolCoachChat(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: BusinessPartnerChatDto
  ) {
    return this.poolCoachService.chat(user.org_id, user.sub, {
      conversationId: dto.conversationId,
      messages: dto.messages as any,
    });
  }

  @Get("pool-coach/chats")
  async listPoolCoachChats(@CurrentUser() user: { org_id: string; sub: string }) {
    return this.poolCoachService.listChats(user.org_id, user.sub);
  }

  @Get("pool-coach/chats/:id")
  async getPoolCoachChat(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string
  ) {
    return this.poolCoachService.getChat(user.org_id, user.sub, id);
  }

  @Delete("pool-coach/chats/:id")
  @HttpCode(200)
  async deletePoolCoachChat(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string
  ) {
    return this.poolCoachService.deleteChat(user.org_id, user.sub, id);
  }

  /* ─── Weekly Tips Queue ─── */

  @Get("tips/weekly-queue")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getWeeklyTipsQueue(@CurrentUser() user: { org_id: string }) {
    const queue = await this.tipSchedulerService.getWeeklyQueue(user.org_id);
    return { items: queue };
  }

  @Post("tips/weekly-queue/approve")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async approveWeeklyTips(@CurrentUser() user: { org_id: string }) {
    const queue = await this.tipSchedulerService.approveWeeklyTips(user.org_id);
    return { items: queue };
  }

  @Patch("tips/weekly-queue/:index")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateWeeklyTip(
    @CurrentUser() user: { org_id: string },
    @Param("index") index: string,
    @Body() body: { tip: string }
  ) {
    const queue = await this.tipSchedulerService.updateWeeklyTip(
      user.org_id,
      parseInt(index, 10),
      body.tip
    );
    return { items: queue };
  }

  @Get("tips/history")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getTipHistory(@CurrentUser() user: { org_id: string }) {
    return this.tipSchedulerService.getTipHistory(user.org_id);
  }

  @Post("tips/send-manual")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async sendManualTip(
    @CurrentUser() user: { org_id: string },
    @Body() body: { tip: string; testPhone?: string }
  ) {
    const result = await this.tipSchedulerService.sendManualTip(
      user.org_id,
      body.tip,
      body.testPhone,
    );
    return result;
  }

  @Post("tips/prepare-weekly")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async prepareWeeklyContent(@CurrentUser() user: { org_id: string }) {
    await this.tipSchedulerService.prepareWeeklyContentForOrg(user.org_id);
    const queue = await this.tipSchedulerService.getWeeklyQueue(user.org_id);
    return { items: queue, message: "Weekly content prepared" };
  }

  /* ─── Newsletter AI Agent ─── */

  @Post("newsletter/generate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async generateNewsletter(
    @CurrentUser() user: { org_id: string },
    @Body() body: { topic?: string; tone?: string }
  ) {
    return this.newsletterAgentService.generateNewsletter(
      user.org_id,
      body.topic,
      body.tone
    );
  }

  @Post("newsletter/preview")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async previewNewsletter(
    @CurrentUser() user: { org_id: string },
    @Body() body: { topic?: string; tone?: string }
  ) {
    return this.newsletterAgentService.previewNewsletter(
      user.org_id,
      body.topic,
      body.tone
    );
  }

  @Post("newsletter/send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async sendNewsletter(
    @CurrentUser() user: { org_id: string },
    @Body()
    body: {
      subject: string;
      htmlBody: string;
      recipientType: "all" | "active" | "custom";
      customEmails?: string[];
    }
  ) {
    return this.newsletterAgentService.sendNewsletter(
      user.org_id,
      body.subject,
      body.htmlBody,
      body.recipientType,
      body.customEmails
    );
  }

  @Get("newsletter/history")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getNewsletterHistory(@CurrentUser() user: { org_id: string }) {
    return this.newsletterAgentService.getNewsletterHistory(user.org_id);
  }

  @Get("newsletter/history/:id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getNewsletterById(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.newsletterAgentService.getNewsletterById(user.org_id, id);
  }

  /* ─── Newsletter Drafts ─── */

  @Get("newsletter/drafts")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getNewsletterDrafts(@CurrentUser() user: { org_id: string }) {
    return this.newsletterAgentService.getDrafts(user.org_id);
  }

  @Post("newsletter/drafts/:id/approve")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async approveNewsletterDraft(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.newsletterAgentService.approveDraft(user.org_id, id);
  }

  @Post("newsletter/drafts/:id/send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async sendNewsletterDraft(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body()
    body: {
      recipientType?: "all" | "active" | "custom";
      customEmails?: string[];
    }
  ) {
    return this.newsletterAgentService.sendApprovedDraft(
      user.org_id,
      id,
      body.recipientType || "all",
      body.customEmails
    );
  }

  // Daily Briefing
  @Post("briefing/send")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async sendDailyBriefing(@CurrentUser() user: { org_id: string }) {
    await this.dailyBriefingService.generateAndSendBriefing(user.org_id);
    return { success: true, message: "Daily briefing sent" };
  }
}

