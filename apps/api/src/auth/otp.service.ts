import { Injectable, Logger } from "@nestjs/common";
import { SmsAdapter } from "../notifications/adapters/sms.adapter";
import { EmailAdapter } from "../notifications/adapters/email.adapter";

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly smsAdapter: SmsAdapter,
    private readonly emailAdapter: EmailAdapter
  ) {}

  async sendOtp(channel: "phone" | "email", target: string, code: string, orgId?: string): Promise<string> {
    if (channel === "phone") {
      const message = `Your PoolCare verification code is: ${code}\n\nValid for 5 minutes. Do not share this code.`;
      return await this.smsAdapter.send(target, message, orgId);
    } else if (channel === "email") {
      const subject = "Your PoolCare Verification Code";
      const text = `Your PoolCare verification code is: ${code}\n\nThis code is valid for 5 minutes. Please do not share this code with anyone.\n\nIf you didn't request this code, please ignore this email.`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ea580c;">PoolCare Verification Code</h2>
          <p>Your verification code is:</p>
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #ea580c; font-size: 32px; margin: 0; letter-spacing: 4px;">${code}</h1>
          </div>
          <p>This code is valid for <strong>5 minutes</strong>. Please do not share this code with anyone.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
            If you didn't request this code, please ignore this email.
          </p>
        </div>
      `;
      return await this.emailAdapter.send(target, subject, text, html, orgId);
    }

    throw new Error(`Unsupported OTP channel: ${channel}`);
  }
}

