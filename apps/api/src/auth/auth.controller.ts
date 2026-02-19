import { Body, Controller, Post, HttpCode, HttpStatus, NotFoundException } from "@nestjs/common";
import { AuthService, devOtpStore } from "./auth.service";
import { OtpRequestDto, OtpVerifyDto } from "./dto";
import { Public } from "./decorators/public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
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
}

