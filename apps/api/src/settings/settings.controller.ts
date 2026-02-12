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
  async updateOrgSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateOrgSettings(user.org_id, data);
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

  @Get("integrations/sms")
  async getSmsSettings(@CurrentUser() user: any) {
    return this.settingsService.getSmsSettings(user.org_id);
  }

  @Patch("integrations/sms")
  async updateSmsSettings(@CurrentUser() user: any, @Body() data: any) {
    return this.settingsService.updateSmsSettings(user.org_id, data);
  }

  @Get("integrations/smtp")
  async getSmtpSettings(@CurrentUser() user: any) {
    return this.settingsService.getSmtpSettings(user.org_id);
  }

  @Patch("integrations/smtp")
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
}

