import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SettingsService } from "../../settings/settings.service";

interface DeywuroResponse {
  code: number;
  message?: string;
}

const isDeywuroResponse = (value: unknown): value is DeywuroResponse => {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "number" &&
    (typeof (value as { message?: unknown }).message === "string" ||
      typeof (value as { message?: unknown }).message === "undefined")
  );
};

@Injectable()
export class SmsAdapter {
  private readonly logger = new Logger(SmsAdapter.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService
  ) {}

  private async getSmsConfig(orgId?: string) {
    // Try to get settings from database if orgId is provided
    if (orgId) {
      try {
        // Get raw settings from database (bypass the password masking)
        const { prisma } = await import("@poolcare/db");
        const orgSetting = await prisma.orgSetting.findUnique({
          where: { orgId },
        });
        
        this.logger.debug(`Loading SMS config for org ${orgId}, found setting: ${!!orgSetting}`);
        
        if (orgSetting?.integrations) {
          const integrations = orgSetting.integrations as any;
          const sms = integrations.sms || {};
          // Treat literal "undefined"/"null" from frontend or old DB as empty
          const rawUsername = sms.username;
          const username = typeof rawUsername === "string" && rawUsername.trim() && rawUsername !== "undefined" && rawUsername !== "null" ? rawUsername.trim() : "";
          const passwordValue = sms.password;
          const hasPassword = passwordValue &&
                             typeof passwordValue === "string" &&
                             passwordValue.trim().length > 0 &&
                             passwordValue !== "***" &&
                             passwordValue !== "******" &&
                             passwordValue !== "••••••••" &&
                             passwordValue !== "null" &&
                             passwordValue !== "undefined";

          this.logger.debug(`SMS settings from DB: username=${!!username}, password=${!!passwordValue}`);
          this.logger.log(`SMS Config Check: username="${username || "(empty)"}", password="${passwordValue ? "***" : "null"}", hasUsername=${!!username}, hasPassword=${hasPassword}`);

          if (username && hasPassword) {
            this.logger.log(`✅ Using SMS settings from database for org ${orgId}`);
            return {
              provider: (sms.provider || "Deywuro")?.toLowerCase() || "deywuro",
              username,
              password: passwordValue,
              source: (sms.senderId && sms.senderId !== "undefined" ? sms.senderId : "PoolCare") as string,
              apiUrl: (sms.apiEndpoint && sms.apiEndpoint !== "undefined" ? sms.apiEndpoint : "https://deywuro.com/api/sms") as string,
            };
          } else {
            this.logger.error(`❌ SMS settings found in DB but invalid. username="${username || "(empty)"}", hasPassword=${hasPassword}`);
          }
        } else {
          this.logger.warn(`No integrations found in org settings for org ${orgId}`);
        }
      } catch (error: any) {
        this.logger.error(`Failed to load SMS settings from database for org ${orgId}:`, error.message || error);
      }
    } else {
      this.logger.debug("No orgId provided, using environment variables");
    }

    // Fall back to environment variables
    const envUsername = this.configService.get<string>("DEYWURO_USERNAME");
    const envPassword = this.configService.get<string>("DEYWURO_PASSWORD");
    
    if (envUsername && envPassword) {
      this.logger.log(`Using SMS settings from environment variables`);
      return {
        provider: this.configService.get<string>("SMS_PROVIDER") || "deywuro",
        username: envUsername,
        password: envPassword,
        source: this.configService.get<string>("SMS_SENDER_ID") || "PoolCare",
        apiUrl: this.configService.get<string>("DEYWURO_API_URL") || "https://deywuro.com/api/sms",
      };
    }
    
    // If no env vars, throw error
    this.logger.error("SMS provider not configured - no database settings and no environment variables");
    throw new Error("SMS provider not configured");
  }

  async send(to: string, message: string, orgId?: string): Promise<string> {
    const config = await this.getSmsConfig(orgId);
    const { provider, username, password, source, apiUrl } = config;

    this.logger.log(`SMS send attempt: provider=${provider}, username=${username || 'missing'}, hasPassword=${!!password}, passwordLength=${password?.length || 0}, orgId=${orgId}`);

    if (!username || !password) {
      this.logger.error(`SMS provider not configured: username=${!!username}, password=${!!password}`);
      throw new Error("SMS provider not configured");
    }

    if (provider === "deywuro" && username && password) {
      try {
        // Normalize phone number (ensure it starts with country code)
        const normalizedPhone = this.normalizePhoneNumber(to);

        // Deywuro API integration (using username/password auth)
        // According to: https://www.deywuro.com/NewUI/Landing/images/NPONTU_SMS_API_DOCUMENT_NEW.pdf
        const params = new URLSearchParams({
          username: username,
          password: password,
          destination: normalizedPhone,
          source: source.substring(0, 11), // Max 11 characters
          message: message,
        });

        const response = await fetch(`${apiUrl}?${params.toString()}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Deywuro API HTTP error: ${response.status} - ${errorText}`);
          throw new Error(`Deywuro API HTTP error: ${response.status}`);
        }

        const json = await response.json().catch((error) => {
          this.logger.error("Failed to parse Deywuro API response as JSON", error);
          throw new Error("Invalid Deywuro API response");
        });

        if (!isDeywuroResponse(json)) {
          this.logger.error("Unexpected Deywuro API response shape", json);
          throw new Error("Unexpected Deywuro API response");
        }

        const data = json;
        
        // Check response code (0 = success)
        if (data.code !== 0) {
          const errorMessage = data.message || `Deywuro API error code: ${data.code}`;
          this.logger.error(`Deywuro API error: ${data.code} - ${errorMessage}`);
          
          // Map response codes to meaningful errors
          switch (data.code) {
            case 401:
              throw new Error("Invalid Deywuro credentials");
            case 403:
              throw new Error("Insufficient balance in Deywuro account");
            case 404:
              throw new Error("Phone number not routable");
            case 402:
              throw new Error("Missing required fields");
            case 500:
              throw new Error("Deywuro server error");
            default:
              throw new Error(errorMessage);
          }
        }

        // Success - return a reference ID
        const messageId = `deywuro_${Date.now()}_${normalizedPhone}`;
        this.logger.log(`SMS sent successfully to ${normalizedPhone}: ${data.message || "OK"}`);
        return messageId;
      } catch (error: any) {
        this.logger.error(`Failed to send SMS via Deywuro to ${to}:`, error.message);
        
        // In development, fall back to console log
        if (this.configService.get<string>("NODE_ENV") === "development") {
          this.logger.warn(`[Dev Mode] SMS would be sent to ${to}: ${message}`);
          return `dev_ref_${Date.now()}`;
        }

        throw error;
      }
    }

    // Fallback: console log in development
    if (this.configService.get<string>("NODE_ENV") === "development") {
      this.logger.log(`[SMS] To: ${to}, Message: ${message}`);
      return `dev_ref_${Date.now()}`;
    }

    throw new Error("SMS provider not configured");
  }

  /**
   * Normalize phone number to include country code
   * Assumes Ghana numbers if no country code present
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, "");

    // If already starts with country code (Ghana: 233)
    if (cleaned.startsWith("233")) {
      return cleaned;
    }

    // If starts with 0, replace with 233 (Ghana)
    if (cleaned.startsWith("0")) {
      return "233" + cleaned.substring(1);
    }

    // If 9 digits, assume it's a Ghana number missing the leading 0
    if (cleaned.length === 9) {
      return "233" + cleaned;
    }

    // Otherwise assume it's already in international format or return as-is
    return cleaned;
  }

  async sendBulk(
    recipients: { to: string; message: string }[],
    orgId?: string
  ): Promise<string[]> {
    const config = await this.getSmsConfig(orgId);
    const { provider, username, password, source, apiUrl } = config;

    // If all recipients have the same message, send as bulk (comma-separated destinations)
    const uniqueMessages = new Set(recipients.map(r => r.message));
    if (uniqueMessages.size === 1 && provider === "deywuro" && username && password) {
      try {
        const message = recipients[0].message;
        const destinations = recipients
          .map(r => this.normalizePhoneNumber(r.to))
          .join(",");

        const params = new URLSearchParams({
          username: username,
          password: password,
          destination: destinations,
          source: source.substring(0, 11),
          message: message,
        });

        const response = await fetch(`${apiUrl}?${params.toString()}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        if (response.ok) {
          const json = await response.json().catch((error) => {
            this.logger.error("Failed to parse Deywuro bulk API response as JSON", error);
            throw new Error("Invalid Deywuro API response");
          });

          if (!isDeywuroResponse(json)) {
            this.logger.error("Unexpected Deywuro bulk API response shape", json);
            throw new Error("Unexpected Deywuro API response");
          }

          if (json.code === 0) {
            this.logger.log(`Bulk SMS sent successfully: ${json.message || "OK"}`);
            return recipients.map(() => `deywuro_bulk_${Date.now()}`);
          }
        }
      } catch (error) {
        this.logger.error("Bulk SMS failed, falling back to individual sends:", error);
      }
    }

    // Fallback to individual sends
    const results: string[] = [];
    for (const recipient of recipients) {
      try {
        const ref = await this.send(recipient.to, recipient.message, orgId);
        results.push(ref);
      } catch (error) {
        this.logger.error(`Failed to send SMS to ${recipient.to}:`, error);
        results.push(`failed_${recipient.to}`);
      }
    }

    return results;
  }
}

