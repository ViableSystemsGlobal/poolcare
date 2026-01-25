import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@poolcare/db";

@Injectable()
export class SettingsService {
  async getOrgSettings(orgId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    // Get org settings if they exist
    const orgSetting = await prisma.orgSetting.findUnique({
      where: { orgId },
    });

    const profile = (orgSetting?.profile as any) || {};

    // Return org data as settings in the format expected by frontend
    return {
      profile: {
        name: org.name,
        logoUrl: profile.logoUrl || null,
        faviconUrl: profile.faviconUrl || null,
        themeColor: profile.themeColor || "orange",
        currency: profile.currency || "GHS",
        timezone: profile.timezone || "Africa/Accra",
        address: profile.address || null,
        supportEmail: profile.supportEmail || null,
        supportPhone: profile.supportPhone || null,
      },
    };
  }

  async updateOrgSettings(orgId: string, data: any) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    // Handle both direct data and profile wrapper
    const profile = data.profile || data;

    // Update organization name if provided
    const updateData: any = {};
    if (profile.name !== undefined) {
      updateData.name = profile.name;
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: updateData,
    });

    // Update or create org settings for profile data
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const currentProfile = (orgSetting.profile as any) || {};
    
    await prisma.orgSetting.update({
      where: { orgId },
      data: {
        profile: {
          ...currentProfile,
          name: updated.name,
          logoUrl: profile.logoUrl !== undefined ? profile.logoUrl : (currentProfile.logoUrl || null),
          faviconUrl: profile.faviconUrl !== undefined ? profile.faviconUrl : (currentProfile.faviconUrl || null),
          themeColor: profile.themeColor || currentProfile.themeColor || "orange",
          currency: profile.currency || currentProfile.currency || "GHS",
          timezone: profile.timezone || currentProfile.timezone || "Africa/Accra",
          address: profile.address !== undefined ? profile.address : (currentProfile.address || null),
          supportEmail: profile.supportEmail || currentProfile.supportEmail || null,
          supportPhone: profile.supportPhone || currentProfile.supportPhone || null,
        },
      },
    });

    // Return in the format expected by frontend
    return {
      profile: {
        name: updated.name,
        logoUrl: profile.logoUrl !== undefined ? profile.logoUrl : (currentProfile.logoUrl || null),
        faviconUrl: profile.faviconUrl !== undefined ? profile.faviconUrl : (currentProfile.faviconUrl || null),
        themeColor: profile.themeColor || currentProfile.themeColor || "orange",
        currency: profile.currency || currentProfile.currency || "GHS",
        timezone: profile.timezone || currentProfile.timezone || "Africa/Accra",
        address: profile.address !== undefined ? profile.address : (currentProfile.address || null),
        supportEmail: profile.supportEmail || currentProfile.supportEmail || null,
        supportPhone: profile.supportPhone || currentProfile.supportPhone || null,
      },
    };
  }

  private async getOrCreateOrgSetting(orgId: string) {
    let orgSetting = await prisma.orgSetting.findUnique({
      where: { orgId },
    });

    if (!orgSetting) {
      orgSetting = await prisma.orgSetting.create({
        data: {
          orgId,
          integrations: {},
        },
      });
    }

    return orgSetting;
  }

  async getSmsSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const sms = integrations.sms || {};

    return {
      settings: {
        provider: sms.provider || "Deywuro",
        username: sms.username || process.env.DEYWURO_USERNAME || "",
        password: sms.password ? "***" : "",
        senderId: sms.senderId || process.env.DEYWURO_SENDER_ID || "PoolCare",
        apiEndpoint: sms.apiEndpoint || process.env.DEYWURO_API_ENDPOINT || "https://deywuro.com/api/sms",
      },
    };
  }

  async updateSmsSettings(orgId: string, data: any) {
    const settings = data.settings || data;
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    
    const integrations = (orgSetting.integrations as any) || {};
    const existingSms = integrations.sms || {};
    
    // Password handling: Only update if a new password is provided
    // If password is not in the request, preserve existing password
    // If password is provided but is masked/empty, preserve existing password
    let finalPassword = existingSms.password || "";
    
    if (settings.password !== undefined) {
      const newPassword = settings.password;
      const isMaskedPassword = newPassword === "***" || 
                               newPassword === "******" || 
                               newPassword === "••••••••";
      const isValidNewPassword = newPassword && 
                                 !isMaskedPassword && 
                                 typeof newPassword === "string" &&
                                 newPassword.trim().length > 0;
      
      if (isValidNewPassword) {
        // User provided a new password - use it
        finalPassword = newPassword.trim();
      }
      // If password is undefined, empty, or masked, keep existing password (don't change it)
    }
    
    integrations.sms = {
      provider: settings.provider || existingSms.provider || "Deywuro",
      username: settings.username !== undefined ? settings.username : (existingSms.username || ""),
      password: finalPassword,
      senderId: settings.senderId !== undefined ? settings.senderId : (existingSms.senderId || "PoolCare"),
      apiEndpoint: settings.apiEndpoint !== undefined ? settings.apiEndpoint : (existingSms.apiEndpoint || "https://deywuro.com/api/sms"),
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return {
      settings: {
        ...integrations.sms,
        password: integrations.sms.password ? "***" : "",
      },
    };
  }

  async getSmtpSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const smtp = integrations.smtp || {};

    return {
      settings: {
        host: smtp.host || process.env.SMTP_HOST || "",
        port: smtp.port || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587),
        user: smtp.user || process.env.SMTP_USER || "",
        password: smtp.password ? "***" : "",
        tls: smtp.tls !== undefined ? smtp.tls : (process.env.SMTP_TLS !== "false"),
      },
    };
  }

  async updateSmtpSettings(orgId: string, data: any) {
    const settings = data.settings || data;
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    
    const integrations = (orgSetting.integrations as any) || {};
    integrations.smtp = {
      host: settings.host || "",
      port: settings.port || 587,
      user: settings.user || "",
      password: settings.password || integrations.smtp?.password || "", // Keep existing if not provided
      tls: settings.tls !== undefined ? settings.tls : true,
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return {
      settings: {
        ...integrations.smtp,
        password: integrations.smtp.password ? "***" : "",
      },
    };
  }

  async getGoogleMapsSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const googleMaps = integrations.googleMaps || {};

    return {
      settings: {
        apiKey: googleMaps.apiKey ? "***" : (process.env.GOOGLE_MAPS_API_KEY || ""),
        enabled: googleMaps.enabled !== undefined ? googleMaps.enabled : !!googleMaps.apiKey,
      },
    };
  }

  async updateGoogleMapsSettings(orgId: string, data: any) {
    const settings = data.settings || data;
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    
    const integrations = (orgSetting.integrations as any) || {};
    const existingGoogleMaps = integrations.googleMaps || {};
    
    // API key handling: Only update if a new key is provided
    // If key is not in the request, preserve existing key
    // If key is provided but is masked/empty, preserve existing key
    let finalApiKey = existingGoogleMaps.apiKey || "";
    
    if (settings.apiKey !== undefined) {
      const newApiKey = settings.apiKey;
      const isMaskedKey = newApiKey === "***" || 
                          newApiKey === "******" || 
                          newApiKey === "••••••••";
      const isValidNewKey = newApiKey && 
                            !isMaskedKey && 
                            typeof newApiKey === "string" &&
                            newApiKey.trim().length > 0;
      
      if (isValidNewKey) {
        // User provided a new API key - use it
        finalApiKey = newApiKey.trim();
      }
      // If key is undefined, empty, or masked, keep existing key (don't change it)
    }
    
    integrations.googleMaps = {
      apiKey: finalApiKey,
      enabled: settings.enabled !== undefined ? settings.enabled : (finalApiKey ? true : false),
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return {
      settings: {
        apiKey: integrations.googleMaps.apiKey ? "***" : "",
        enabled: integrations.googleMaps.enabled,
      },
    };
  }

  /**
   * Get Google Maps API key for an organization
   * Returns org-specific key if set, otherwise falls back to environment variable
   */
  async getGoogleMapsApiKey(orgId: string): Promise<string | null> {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const googleMaps = integrations.googleMaps || {};
    
    // Return org-specific key if available and enabled
    if (googleMaps.enabled && googleMaps.apiKey) {
      return googleMaps.apiKey;
    }
    
    // Fall back to environment variable
    return process.env.GOOGLE_MAPS_API_KEY || null;
  }

  async getTaxSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const tax = (orgSetting.tax as any) || {};

    return {
      defaultTaxPct: tax.defaultTaxPct || 0,
      taxName: tax.taxName || "VAT",
      invoiceNumbering: tax.invoiceNumbering || {
        prefix: "INV-",
        next: 1,
        width: 4,
      },
      currency: tax.currency || "GHS",
      showTaxOnItems: tax.showTaxOnItems !== undefined ? tax.showTaxOnItems : false,
    };
  }

  async updateTaxSettings(orgId: string, data: any) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const currentTax = (orgSetting.tax as any) || {};

    const updatedTax = {
      defaultTaxPct: data.defaultTaxPct !== undefined ? data.defaultTaxPct : (currentTax.defaultTaxPct || 0),
      taxName: data.taxName || currentTax.taxName || "VAT",
      invoiceNumbering: data.invoiceNumbering || currentTax.invoiceNumbering || {
        prefix: "INV-",
        next: 1,
        width: 4,
      },
      currency: data.currency || currentTax.currency || "GHS",
      showTaxOnItems: data.showTaxOnItems !== undefined ? data.showTaxOnItems : (currentTax.showTaxOnItems || false),
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { tax: updatedTax },
    });

    return updatedTax;
  }
}

