import { Body, Controller, Post, HttpCode, HttpStatus } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { OtpRequestDto, OtpVerifyDto } from "./dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Post("otp/verify")
  async verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOtp(dto);
  }
}

