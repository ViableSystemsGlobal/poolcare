import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { createEmailTemplate, getOrgEmailSettings, emailUi } from "../email/email-template.util";
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
        : { organizationName: "PoolCare", primaryColor: "#387c52" };
            const ui = emailUi;
      const spaced = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
      const html = createEmailTemplate(
        ui.code(spaced) +
          ui.p("Enter this code in the app. It expires in <strong>5 minutes</strong>.") +
          ui.p("We'll never ask for this code by phone or WhatsApp. Don't share it with anyone.", "margin:0;color:#6b7280;font-size:14px;"),
        {
          ...brand,
          eyebrow: "Sign in",
          title: "Your sign-in code",
          preheader: `${spaced} is your ${brand.organizationName || "PoolCare"} code. It expires in 5 minutes.`,
          reason: "Didn't ask for this? You can ignore this email. Nobody can sign in without the code.",
        }
      );
      return await this.emailAdapter.send(target, subject, text, html, orgId);
    }

    throw new BadRequestException(`Unsupported OTP channel: ${channel}`);
  }
}

