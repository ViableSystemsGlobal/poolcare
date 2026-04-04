import { Body, Controller, Post, Patch, HttpCode, HttpStatus, NotFoundException, UseGuards, UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { AuthService, devOtpStore } from "./auth.service";
import { OtpRequestDto, OtpVerifyDto } from "./dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { FilesService } from "../files/files.service";
import { prisma } from "@poolcare/db";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly filesService: FilesService,
  ) {}

  @Public()
  @Throttle({ short: { ttl: 60000, limit: 5 } }) // max 5 OTP requests per minute per IP
  @Post("otp/request")
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: OtpRequestDto) {
    console.log('[AuthController] Received OTP request:', dto);
    try {
      await this.authService.requestOtp(dto);
      console.log('[AuthController] OTP request processed, returning response');
      return { ok: true };
    } catch (error: any) {
      console.error('[AuthController] Error processing OTP request:', error);
      throw error;
    }
  }

  @Public()
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  @Post("otp/verify")
  async verifyOtp(@Body() dto: OtpVerifyDto) {
    console.log('[AuthController] Received OTP verify request:', { channel: dto.channel, target: dto.target, codeLength: dto.code?.length });
    try {
      const result = await this.authService.verifyOtp(dto);
      console.log('[AuthController] OTP verification successful for:', dto.target);
      return result;
    } catch (error: any) {
      console.error('[AuthController] OTP verification failed:', error);
      console.error('[AuthController] Error stack:', error.stack);
      // Return more detailed error in development
      if (process.env.NODE_ENV !== "production") {
        console.error('[AuthController] Full error details:', JSON.stringify(error, null, 2));
      }
      throw error;
    }
  }

  @Public()
  @Post("otp/check")
  async checkOtpStatus(@Body() dto: { channel: string; target: string }) {
    // Dev-only helper — returns 404 in production so the route is not discoverable
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }

    const key = `${dto.channel}:${dto.target}`;
    const stored = devOtpStore.get(key);

    if (!stored) {
      return { exists: false, code: null, message: "No OTP found. Request a new code." };
    }

    if (stored.expiresAt < new Date()) {
      devOtpStore.delete(key);
      return { exists: false, code: null, message: "OTP has expired. Request a new code." };
    }

    return { exists: true, code: stored.code, expiresAt: stored.expiresAt };
  }

  @Patch("profile")
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: { sub: string },
    @Body() body: { name?: string; email?: string; phone?: string },
  ) {
    const data: any = {};
    if (body.name !== undefined) data.name = body.name || null;
    if (body.email !== undefined) data.email = body.email?.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;

    const updated = await prisma.user.update({
      where: { id: user.sub },
      data,
      select: { id: true, name: true, email: true, phone: true },
    });
    return updated;
  }

  @Post("profile/avatar")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("avatar"))
  async uploadAvatar(
    @CurrentUser() user: { sub: string; org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/i }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const url = await this.filesService.uploadImage(user.org_id, file, "user_avatar", user.sub);

    await prisma.user.update({
      where: { id: user.sub },
      data: { imageUrl: url },
    });

    return { imageUrl: url };
  }
}

