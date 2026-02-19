import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CarersService } from "./carers.service";
import { FilesService } from "../files/files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateCarerDto, UpdateCarerDto, RegisterDeviceTokenDto } from "./dto";

@Controller("carers")
@UseGuards(JwtAuthGuard)
export class CarersController {
  constructor(
    private readonly carersService: CarersService,
    private readonly filesService: FilesService
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string; role: string },
    @Query("query") query?: string,
    @Query("active") active?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.carersService.list(user.org_id, user.role, {
      query,
      active: active === "true" ? true : active === "false" ? false : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateCarerDto
  ) {
    return this.carersService.create(user.org_id, dto);
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string; role: string; sub: string },
    @Param("id") id: string
  ) {
    return this.carersService.getOne(user.org_id, user.role, user.sub, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateCarerDto
  ) {
    return this.carersService.update(user.org_id, id, dto);
  }

  @Post(":id/device-tokens")
  async registerDeviceToken(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") carerId: string,
    @Body() dto: RegisterDeviceTokenDto
  ) {
    return this.carersService.registerDeviceToken(user.org_id, user.sub, carerId, dto);
  }

  @Get("me/carer")
  async getMyCarer(@CurrentUser() user: { org_id: string; sub: string }) {
    return this.carersService.getMyCarer(user.org_id, user.sub);
  }

  @Get("me/earnings")
  async getMyEarnings(
    @CurrentUser() user: { org_id: string; sub: string },
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    return this.carersService.getMyEarnings(user.org_id, user.sub, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
    });
  }

  @Get(":id/earnings")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async getEarnings(
    @CurrentUser() user: { org_id: string },
    @Param("id") carerId: string,
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    return this.carersService.getEarnings(user.org_id, carerId, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
    });
  }

  @Patch("me/carer")
  async updateMyCarer(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: UpdateCarerDto
  ) {
    return this.carersService.updateMyCarer(user.org_id, user.sub, dto);
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
    const imageUrl = await this.filesService.uploadImage(user.org_id, file, "carer", user.sub);
    await this.carersService.updateMyCarer(user.org_id, user.sub, { imageUrl });
    return { imageUrl };
  }

  @Post(":id/current-location")
  async updateCurrentLocation(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") carerId: string,
    @Body() body: { lat: number; lng: number }
  ) {
    return this.carersService.updateCurrentLocation(
      user.org_id,
      user.sub,
      carerId,
      body.lat,
      body.lng
    );
  }

  @Post(":id/home-base")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateHomeBase(
    @CurrentUser() user: { org_id: string },
    @Param("id") carerId: string,
    @Body() body: { address?: string; lat?: number; lng?: number }
  ) {
    return this.carersService.updateHomeBase(user.org_id, carerId, body);
  }

  @Post("upload-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("image"))
  async uploadImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const imageUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "carer",
        "profile"
      );

      return { imageUrl };
    } catch (error: any) {
      console.error("Image upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload image");
    }
  }
}
