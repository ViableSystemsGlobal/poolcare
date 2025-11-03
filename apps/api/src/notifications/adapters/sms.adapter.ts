import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SmsAdapter {
  private readonly logger = new Logger(SmsAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, message: string, orgId?: string): Promise<string> {
    const provider = this.configService.get<string>("SMS_PROVIDER") || "deywuro";
    const username = this.configService.get<string>("DEYWURO_USERNAME");
    const password = this.configService.get<string>("DEYWURO_PASSWORD");
    const source = this.configService.get<string>("SMS_SENDER_ID") || "PoolCare";
    const apiUrl = this.configService.get<string>("DEYWURO_API_URL") || "https://deywuro.com/api/sms";

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

        const data = await response.json();
        
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
    const provider = this.configService.get<string>("SMS_PROVIDER") || "deywuro";
    const username = this.configService.get<string>("DEYWURO_USERNAME");
    const password = this.configService.get<string>("DEYWURO_PASSWORD");
    const source = this.configService.get<string>("SMS_SENDER_ID") || "PoolCare";
    const apiUrl = this.configService.get<string>("DEYWURO_API_URL") || "https://deywuro.com/api/sms";

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
          const data = await response.json();
          if (data.code === 0) {
            this.logger.log(`Bulk SMS sent successfully: ${data.message || "OK"}`);
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

