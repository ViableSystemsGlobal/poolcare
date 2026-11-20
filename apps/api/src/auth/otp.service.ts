import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { createEmailTemplate, getOrgEmailSettings } from "../email/email-template.util";
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
      const brand = orgId
        ? await getOrgEmailSettings(orgId)
        : { organizationName: "PoolCare", primaryColor: "#0d9488" };
      const color = brand.primaryColor || "#0d9488";
      const html = createEmailTemplate(
        `
        <h2 style="color: #333333; margin-top: 0; margin-bottom: 16px;">Your verification code</h2>
        <p style="margin: 0 0 16px 0;">Use this code to sign in:</p>
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 0 0 16px 0; border-radius: 8px;">
          <span style="color: ${color}; font-size: 32px; font-weight: bold; letter-spacing: 6px;">${code}</span>
        </div>
        <p style="margin: 0 0 16px 0;">It's valid for <strong>5 minutes</strong>. Don't share it with anyone.</p>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">If you didn't ask for this code, you can ignore this email.</p>
      `,
        brand
      );
      return await this.emailAdapter.send(target, subject, text, html, orgId);
    }

    throw new BadRequestException(`Unsupported OTP channel: ${channel}`);
  }
}

