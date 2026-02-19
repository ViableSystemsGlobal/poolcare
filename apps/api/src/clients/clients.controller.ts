import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ClientsService } from "./clients.service";
import { FilesService } from "../files/files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateClientDto, UpdateClientDto, CreateHouseholdDto, InviteHouseholdMemberDto } from "./dto";
import { ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from "@nestjs/common/pipes";

@Controller("clients")
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly filesService: FilesService
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string },
    @Query("query") query?: string,
    @Query("tag") tag?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.clientsService.list(user.org_id, user.role, {
      query,
      tag,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateClientDto
  ) {
    return this.clientsService.create(user.org_id, dto);
  }

  // ========================
  // SELF-PROFILE (me) – must come before :id routes
  // ========================

  @Get("me")
  async getMyProfile(@CurrentUser() user: { org_id: string; sub: string }) {
    return this.clientsService.getMyProfile(user.org_id, user.sub);
  }

  @Patch("me")
  async updateMyProfile(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: { name?: string; phone?: string; email?: string; imageUrl?: string }
  ) {
    return this.clientsService.updateMyProfile(user.org_id, user.sub, dto);
  }

  @Post("me/device-token")
  async registerMyDeviceToken(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: { token: string; platform: string }
  ) {
    return this.clientsService.registerMyDeviceToken(user.org_id, user.sub, dto);
  }

  @Get("me/notifications")
  async getMyNotifications(
    @CurrentUser() user: { org_id: string; sub: string },
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.clientsService.getMyNotifications(
      user.org_id,
      user.sub,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 30
    );
  }

  @Post("me/upload-photo")
  @UseInterceptors(FileInterceptor("photo"))
  async uploadMyPhoto(
    @CurrentUser() user: { org_id: string; sub: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    const imageUrl = await this.filesService.uploadImage(user.org_id, file, "pool_image", user.org_id);
    await this.clientsService.updateMyProfile(user.org_id, user.sub, { imageUrl });
    return { imageUrl };
  }

  // ========================
  // BY ID – must come after static routes
  // ========================

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.clientsService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateClientDto
  ) {
    return this.clientsService.update(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.clientsService.delete(user.org_id, id);
  }

  @Post("upload-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("image"))
  async uploadImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|gif)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const imageUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "client_profile",
        user.org_id
      );

      return { imageUrl };
    } catch (error: any) {
      console.error("Image upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload image");
    }
  }

  // =====================
  // HOUSEHOLD ENDPOINTS
  // =====================

  @Post(":id/household")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CLIENT")
  async createHousehold(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") clientId: string,
    @Body() dto: CreateHouseholdDto
  ) {
    // CLIENT role can only create household for themselves
    if (user.role === "CLIENT" && user.sub !== clientId) {
      throw new BadRequestException("You can only create a household for yourself");
    }
    return this.clientsService.createHousehold(user.org_id, clientId, dto);
  }

  @Get(":id/household")
  async getHousehold(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") clientId: string
  ) {
    // CLIENT role can only view their own household
    if (user.role === "CLIENT" && user.sub !== clientId) {
      throw new BadRequestException("You can only view your own household");
    }
    return this.clientsService.getHousehold(user.org_id, clientId);
  }

  @Post(":id/household/invite")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CLIENT")
  async inviteHouseholdMember(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") primaryClientId: string,
    @Body() dto: InviteHouseholdMemberDto
  ) {
    // CLIENT role can only invite from their own household
    if (user.role === "CLIENT" && user.sub !== primaryClientId) {
      throw new BadRequestException("You can only invite members to your own household");
    }
    return this.clientsService.inviteHouseholdMember(user.org_id, primaryClientId, dto);
  }

  @Post(":id/household/members/:memberId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CLIENT")
  async addClientToHousehold(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") clientId: string,
    @Param("memberId") memberId: string,
    @Query("householdId") householdId: string
  ) {
    if (!householdId) {
      throw new BadRequestException("householdId query parameter is required");
    }
    // CLIENT role can only add members to their own household
    if (user.role === "CLIENT") {
      // Verify the client is the primary client of the household
      const household = await this.clientsService.getHousehold(user.org_id, clientId);
      if (household.primaryClientId !== clientId) {
        throw new BadRequestException("Only the primary client can add members");
      }
      // Verify the householdId matches
      if (household.id !== householdId) {
        throw new BadRequestException("Household ID mismatch");
      }
    }
    return this.clientsService.addClientToHousehold(user.org_id, memberId, householdId);
  }

  @Post(":id/household/leave")
  @UseGuards(RolesGuard)
  @Roles("CLIENT")
  async leaveHousehold(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") clientId: string
  ) {
    // CLIENT can only leave their own household
    if (user.sub !== clientId) {
      throw new BadRequestException("You can only leave your own household");
    }
    return this.clientsService.leaveHousehold(user.org_id, clientId);
  }

  @Post(":id/household/members/:memberId/remove")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "CLIENT")
  async removeHouseholdMember(
    @CurrentUser() user: { org_id: string; sub: string; role: string },
    @Param("id") primaryClientId: string,
    @Param("memberId") memberId: string
  ) {
    // CLIENT role can only remove members from their own household
    if (user.role === "CLIENT" && user.sub !== primaryClientId) {
      throw new BadRequestException("You can only remove members from your own household");
    }
    return this.clientsService.removeHouseholdMember(user.org_id, primaryClientId, memberId);
  }
}

