import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import * as nodemailer from "nodemailer";
import { Transporter } from "nodemailer";

@Injectable()
export class EmailAdapter {
  private readonly logger = new Logger(EmailAdapter.name);
  private defaultTransporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeDefaultTransporter();
  }

  private initializeDefaultTransporter() {
    const smtpHost = this.configService.get<string>("SMTP_HOST") || "smtp.hostinger.com";
    const smtpPort = this.configService.get<number>("SMTP_PORT") || 465;
    const smtpSecure = this.configService.get<boolean>("SMTP_SECURE") ?? true; // SSL by default
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPassword = this.configService.get<string>("SMTP_PASSWORD");
    const smtpFrom = this.configService.get<string>("SMTP_FROM") || smtpUser;
    const smtpFromName = this.configService.get<string>("SMTP_FROM_NAME") || "PoolCare";

    if (!smtpUser || !smtpPassword) {
      this.logger.warn(
        "SMTP credentials not configured in environment. Will check database settings per organization."
      );
      return;
    }

    this.defaultTransporter = nodemailer.createTransport({
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

    this.logger.log(`Default email adapter initialized (${smtpHost}:${smtpPort})`);
  }

  /**
   * Get SMTP configuration for an organization
   * Checks database first, falls back to environment variables
   */
  private async getSmtpConfig(orgId?: string): Promise<{
    transporter: Transporter | null;
    from: string;
    fromName: string;
  }> {
    // Try to get settings from database if orgId is provided
    if (orgId) {
      try {
        const orgSetting = await prisma.orgSetting.findUnique({
          where: { orgId },
        });

        if (orgSetting?.integrations) {
          const integrations = orgSetting.integrations as any;
          const smtp = integrations.smtp || {};

          // Check if we have valid credentials
          const hasUser = smtp.user && typeof smtp.user === "string" && smtp.user.trim().length > 0;
          const passwordValue = smtp.password;
          const hasPassword =
            passwordValue &&
            typeof passwordValue === "string" &&
            passwordValue.trim().length > 0 &&
            passwordValue !== "***" &&
            passwordValue !== "******" &&
            passwordValue !== "••••••••" &&
            passwordValue !== "null" &&
            passwordValue !== "undefined";

          if (hasUser && hasPassword) {
            const host = smtp.host || this.configService.get<string>("SMTP_HOST") || "smtp.hostinger.com";
            const port = smtp.port || this.configService.get<number>("SMTP_PORT") || 465;
            const tls = smtp.tls !== undefined ? smtp.tls : (port === 587 ? true : false);
            // Port 465 = SSL (secure: true)
            // Port 587 = TLS (secure: false, requireTLS: true)
            const secure = port === 465;

            this.logger.log(`Using org-specific SMTP settings for org ${orgId} (${host}:${port}, secure=${secure}, tls=${tls})`);

            const transporterConfig: any = {
              host,
              port,
              secure,
              auth: {
                user: smtp.user,
                pass: passwordValue,
              },
              debug: this.configService.get<string>("NODE_ENV") === "development",
            };

            // For port 587, enable TLS if specified
            if (port === 587 && tls) {
              transporterConfig.requireTLS = true;
            }

            const transporter = nodemailer.createTransport(transporterConfig);

            return {
              transporter,
              from: smtp.user,
              fromName: this.configService.get<string>("SMTP_FROM_NAME") || "PoolCare",
            };
          } else {
            this.logger.warn(
              `Org ${orgId} SMTP settings incomplete: hasUser=${hasUser}, hasPassword=${hasPassword}, user="${smtp.user || 'missing'}", password="${passwordValue ? (passwordValue.length > 2 ? passwordValue.substring(0, 2) + '...' : '***') : 'missing'}"`
            );
          }
        } else {
          this.logger.debug(`No integrations found in org settings for org ${orgId}`);
        }
      } catch (error: any) {
        this.logger.error(`Failed to load SMTP config for org ${orgId}:`, error.message);
      }
    }

    // Fall back to default transporter (from environment variables)
    if (this.defaultTransporter) {
      const smtpFrom = this.configService.get<string>("SMTP_FROM") || this.configService.get<string>("SMTP_USER");
      const smtpFromName = this.configService.get<string>("SMTP_FROM_NAME") || "PoolCare";
      return {
        transporter: this.defaultTransporter,
        from: smtpFrom || "",
        fromName: smtpFromName,
      };
    }

    // No transporter available
    return {
      transporter: null,
      from: "",
      fromName: "PoolCare",
    };
  }

  async send(
    to: string,
    subject: string,
    text: string,
    html?: string,
    orgId?: string
  ): Promise<string> {
    // Get SMTP config (from database or environment)
    const config = await this.getSmtpConfig(orgId);

    // Fallback to console in development if SMTP not configured
    if (!config.transporter) {
      if (this.configService.get<string>("NODE_ENV") === "development") {
        this.logger.log(`[Email Dev Mode] To: ${to}, Subject: ${subject}`);
        this.logger.log(`[Email Dev Mode] Message: ${text.substring(0, 100)}...`);
        this.logger.warn(
          `[Email Dev Mode] SMTP not configured. Email would be sent to ${to}. Configure SMTP in Settings > Integrations.`
        );
        return `dev_ref_${Date.now()}`;
      }
      throw new Error(
        "SMTP not configured. Please configure Email settings in Settings > Integrations."
      );
    }

    try {
      const info = await config.transporter.sendMail({
        from: `${config.fromName} <${config.from}>`,
        to,
        subject,
        text,
        html: html || text,
      });

      this.logger.log(`Email sent successfully to ${to}: ${info.messageId}`);
      return info.messageId || `email_${Date.now()}`;
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}:`, error.message);
      this.logger.error(`SMTP Error Details:`, {
        code: error.code,
        command: error.command,
        response: error.response,
      });
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

  async verifyConnection(orgId?: string): Promise<boolean> {
    const config = await this.getSmtpConfig(orgId);
    
    if (!config.transporter) {
      return false;
    }

    try {
      await config.transporter.verify();
      this.logger.log(`SMTP connection verified successfully${orgId ? ` for org ${orgId}` : ""}`);
      return true;
    } catch (error: any) {
      this.logger.error(`SMTP connection verification failed${orgId ? ` for org ${orgId}` : ""}:`, error.message);
      return false;
    }
  }
}

