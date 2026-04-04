import { Controller, Get, Patch, Body, UseGuards, Post, UseInterceptors, UploadedFile, BadRequestException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SettingsService } from "./settings.service";
import { FilesService } from "../files/files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from "@nestjs/common/pipes";

@Controller("settings")
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly filesService: FilesService
  ) {}

  @Get("branding")
  @Public()
  async getPublicBranding() {
    return this.settingsService.getPublicBranding();
  }

  @Get("org")
  async getOrgSettings(@CurrentUser() user: any) {
    return this.settingsService.getOrgSettings(user.org_id);
  }

  @Patch("org")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateOrgSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateOrgSettings(user.org_id, data);
  }

  @Get("tip-schedule")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getTipSchedule(@CurrentUser() user: any) {
    return this.settingsService.getTipSchedule(user.org_id);
  }

  @Patch("tip-schedule")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateTipSchedule(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateTipSchedule(user.org_id, data);
  }

  @Get("tax")
  async getTaxSettings(@CurrentUser() user: any) {
    return this.settingsService.getTaxSettings(user.org_id);
  }

  @Patch("tax")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateTaxSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateTaxSettings(user.org_id, data);
  }

  @Get("policies")
  async getPolicies(@CurrentUser() user: any) {
    return this.settingsService.getPolicies(user.org_id);
  }

  @Patch("policies")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updatePolicies(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updatePolicies(user.org_id, data);
  }

  @Get("daily-briefing")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getDailyBriefingSettings(@CurrentUser() user: any) {
    return this.settingsService.getDailyBriefingSettings(user.org_id);
  }

  @Patch("daily-briefing")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateDailyBriefingSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateDailyBriefingSettings(user.org_id, data);
  }

  @Get("job-generation")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getJobGenerationSettings(@CurrentUser() user: any) {
    return this.settingsService.getJobGenerationSettings(user.org_id);
  }

  @Patch("job-generation")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateJobGenerationSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateJobGenerationSettings(user.org_id, data);
  }

  @Get("integrations/sms")
  async getSmsSettings(@CurrentUser() user: any) {
    return this.settingsService.getSmsSettings(user.org_id);
  }

  @Patch("integrations/sms")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateSmsSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateSmsSettings(user.org_id, data);
  }

  @Get("integrations/smtp")
  async getSmtpSettings(@CurrentUser() user: any) {
    return this.settingsService.getSmtpSettings(user.org_id);
  }

  @Patch("integrations/smtp")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateSmtpSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateSmtpSettings(user.org_id, data);
  }

  @Get("integrations/google-maps")
  async getGoogleMapsSettings(@CurrentUser() user: any) {
    return this.settingsService.getGoogleMapsSettings(user.org_id);
  }

  @Patch("integrations/google-maps")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateGoogleMapsSettings(@CurrentUser() user: any, @Body() data: any) {
    // API key verification is done in SettingsService
    return this.settingsService.updateGoogleMapsSettings(user.org_id, data);
  }

  @Get("integrations/llm")
  async getLlmSettings(@CurrentUser() user: any) {
    return this.settingsService.getLlmSettings(user.org_id);
  }

  @Patch("integrations/llm")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateLlmSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateLlmSettings(user.org_id, data);
  }

  @Post("integrations/llm/test")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async testLlmConnection(@CurrentUser() user: any) {
    return this.settingsService.testLlmConnection(user.org_id);
  }

  @Post("upload-logo")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("logo"))
  async uploadLogo(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|svg)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const logoUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "org_logo",
        user.org_id
      );

      // Update org settings with logo URL
      await this.settingsService.updateOrgSettings(user.org_id, {
        profile: { logoUrl },
      });

      return { logoUrl };
    } catch (error: any) {
      console.error("Logo upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload logo");
    }
  }

  @Post("upload-loader-logo")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("loaderLogo"))
  async uploadLoaderLogo(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|svg)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const loaderLogoUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "loader_logo",
        user.org_id
      );

      await this.settingsService.updateOrgSettings(user.org_id, {
        profile: { loaderLogoUrl },
      });

      return { loaderLogoUrl };
    } catch (error: any) {
      console.error("Loader logo upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload loader logo");
    }
  }

  @Post("upload-home-card-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("homeCardImage"))
  async uploadHomeCardImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const homeCardImageUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "home_card_image",
        user.org_id
      );

      // Update org settings with home card image URL
      await this.settingsService.updateOrgSettings(user.org_id, {
        profile: { homeCardImageUrl },
      });

      return { homeCardImageUrl };
    } catch (error: any) {
      console.error("Home card image upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload home card image");
    }
  }

  @Post("upload-request-card-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("requestCardImage"))
  async uploadRequestCardImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    try {
      const requestCardImageUrl = await this.filesService.uploadImage(user.org_id, file, "request_card_image", user.org_id);
      await this.settingsService.updateOrgSettings(user.org_id, { profile: { requestCardImageUrl } });
      return { requestCardImageUrl };
    } catch (error: any) {
      throw new BadRequestException(error.message || "Failed to upload request card image");
    }
  }

  @Post("upload-chat-card-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("chatCardImage"))
  async uploadChatCardImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    try {
      const chatCardImageUrl = await this.filesService.uploadImage(user.org_id, file, "chat_card_image", user.org_id);
      await this.settingsService.updateOrgSettings(user.org_id, { profile: { chatCardImageUrl } });
      return { chatCardImageUrl };
    } catch (error: any) {
      throw new BadRequestException(error.message || "Failed to upload chat card image");
    }
  }

  @Post("upload-favicon")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("favicon"))
  async uploadFavicon(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 1 * 1024 * 1024 }), // 1MB
          new FileTypeValidator({ fileType: /(ico|png|svg)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const faviconUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "org_favicon",
        user.org_id
      );

      // Update org settings with favicon URL
      await this.settingsService.updateOrgSettings(user.org_id, {
        profile: { faviconUrl },
      });

      return { faviconUrl };
    } catch (error: any) {
      console.error("Favicon upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload favicon");
    }
  }

  @Post("upload-help-assistant-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("helpAssistantImage"))
  async uploadHelpAssistantImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const helpAssistantImageUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "help_assistant_image",
        user.org_id
      );

      await this.settingsService.updateOrgSettings(user.org_id, {
        profile: { helpAssistantImageUrl },
      });

      return { helpAssistantImageUrl };
    } catch (error: any) {
      console.error("Help assistant image upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload help assistant image");
    }
  }

  @Post("upload-login-background")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("loginBackground"))
  async uploadLoginBackground(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|mp4|webm)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const loginBackgroundUrl = await this.filesService.uploadMedia(
        user.org_id,
        file,
        "login_background",
        user.org_id
      );

      const loginBackgroundType = file.mimetype.startsWith("video/") ? "video" : "image";

      await this.settingsService.updateOrgSettings(user.org_id, {
        profile: { loginBackgroundUrl, loginBackgroundType },
      });

      return { loginBackgroundUrl, loginBackgroundType };
    } catch (error: any) {
      console.error("Login background upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload login background");
    }
  }

  @Post("upload-splash-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("splashImage"))
  async uploadSplashImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const splashImageUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "app_splash",
        user.org_id
      );

      await this.settingsService.updateOrgSettings(user.org_id, {
        profile: { splashImageUrl },
      });

      return { splashImageUrl };
    } catch (error: any) {
      console.error("Splash image upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload splash image");
    }
  }
}

