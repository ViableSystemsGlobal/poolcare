import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { Transporter } from "nodemailer";

@Injectable()
export class EmailAdapter {
  private readonly logger = new Logger(EmailAdapter.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpHost = this.configService.get<string>("SMTP_HOST") || "smtp.hostinger.com";
    const smtpPort = this.configService.get<number>("SMTP_PORT") || 465;
    const smtpSecure = this.configService.get<boolean>("SMTP_SECURE") ?? true; // SSL by default
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPassword = this.configService.get<string>("SMTP_PASSWORD");
    const smtpFrom = this.configService.get<string>("SMTP_FROM") || smtpUser;
    const smtpFromName = this.configService.get<string>("SMTP_FROM_NAME") || "PoolCare";

    if (!smtpUser || !smtpPassword) {
      this.logger.warn(
        "SMTP credentials not configured. Email sending will be disabled."
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      // Enable debug in development
      debug: this.configService.get<string>("NODE_ENV") === "development",
    });

    this.logger.log(`Email adapter initialized (${smtpHost}:${smtpPort})`);
  }

  async send(
    to: string,
    subject: string,
    text: string,
    html?: string,
    orgId?: string
  ): Promise<string> {
    const smtpFrom = this.configService.get<string>("SMTP_FROM") || this.configService.get<string>("SMTP_USER");
    const smtpFromName = this.configService.get<string>("SMTP_FROM_NAME") || "PoolCare";

    // Fallback to console in development if SMTP not configured
    if (!this.transporter) {
      if (this.configService.get<string>("NODE_ENV") === "development") {
        this.logger.log(`[Email] To: ${to}, Subject: ${subject}`);
        this.logger.log(`[Email] Message: ${text}`);
        return `dev_ref_${Date.now()}`;
      }
      throw new Error("SMTP not configured");
    }

    try {
      const info = await this.transporter.sendMail({
        from: `${smtpFromName} <${smtpFrom}>`,
        to,
        subject,
        text,
        html: html || text,
      });

      this.logger.log(`Email sent successfully to ${to}: ${info.messageId}`);
      return info.messageId || `email_${Date.now()}`;
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}:`, error.message);
      throw error;
    }
  }

  async sendBulk(
    recipients: { to: string; subject: string; text: string; html?: string }[],
    orgId?: string
  ): Promise<string[]> {
    const results: string[] = [];

    for (const recipient of recipients) {
      try {
        const messageId = await this.send(
          recipient.to,
          recipient.subject,
          recipient.text,
          recipient.html,
          orgId
        );
        results.push(messageId);
      } catch (error) {
        this.logger.error(`Failed to send email to ${recipient.to}:`, error);
        results.push(`failed_${recipient.to}`);
      }
    }

    return results;
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      this.logger.log("SMTP connection verified successfully");
      return true;
    } catch (error: any) {
      this.logger.error("SMTP connection verification failed:", error.message);
      return false;
    }
  }
}

