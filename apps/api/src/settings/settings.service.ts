import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'poolcare-dev-encryption-key-32ch'; // Must be 32 chars
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text; // Not encrypted, return as-is (backward compat)
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return text; // If decryption fails, return as-is (backward compat)
  }
}

@Injectable()
export class SettingsService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Public branding for login page and unauthenticated views.
   * Returns the organization's name, logo (absolute URL), and theme.
   * Prefers the org that has branding settings (logoUrl or non-default themeColor).
   */
  async getPublicBranding(): Promise<{
    organizationName: string;
    logoUrl: string | null;
    loaderLogoUrl: string | null;
    themeColor: string;
    primaryColorHex: string;
    loginBackgroundUrl: string | null;
    loginBackgroundType: string | null;
  }> {
    // Find an OrgSetting that has branding configured (logoUrl or custom theme)
    const orgSettings = await prisma.orgSetting.findMany({
      where: {
        OR: [
          { profile: { path: ["logoUrl"], not: null } },
          { profile: { path: ["themeColor"], not: "orange" } },
        ],
      },
      include: { org: true },
      orderBy: { updatedAt: "desc" },
      take: 1,
    });

    let org: { id: string; name: string | null } | null = null;
    let profile: any = {};

    if (orgSettings.length > 0 && orgSettings[0].org) {
      org = orgSettings[0].org;
      profile = (orgSettings[0].profile as any) || {};
    } else {
      // Fallback to first org
      org = await prisma.organization.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (org) {
        const setting = await prisma.orgSetting.findUnique({
          where: { orgId: org.id },
        });
        profile = (setting?.profile as any) || {};
      }
    }

    if (!org) {
      return {
        organizationName: "",
        logoUrl: null,
        loaderLogoUrl: null,
        themeColor: "teal",
        primaryColorHex: "#6b7280",
        loginBackgroundUrl: null,
        loginBackgroundType: null,
      };
    }

    const rawLogoUrl = profile.logoUrl || null;
    const rawLoaderLogoUrl = profile.loaderLogoUrl || null;
    const themeColor = profile.themeColor || "teal";
    const customHex = profile.customColorHex && String(profile.customColorHex).trim();
    const primaryColorHex = customHex
      ? (customHex.startsWith("#") ? customHex : `#${customHex}`)
      : this.getThemeColorHex(themeColor);
    // Ensure logo URLs are absolute so login page (different origin) can load them
    const logoUrl = rawLogoUrl ? this.toAbsoluteLogoUrl(rawLogoUrl) : null;
    const loaderLogoUrl = rawLoaderLogoUrl ? this.toAbsoluteLogoUrl(rawLoaderLogoUrl) : null;
    const rawLoginBgUrl = profile.loginBackgroundUrl || null;
    const loginBackgroundUrl = rawLoginBgUrl ? this.toAbsoluteLogoUrl(rawLoginBgUrl) : null;
    const loginBackgroundType: string | null = profile.loginBackgroundType || null;
    return {
      organizationName: org.name || "PoolCare",
      logoUrl,
      loaderLogoUrl,
      themeColor,
      primaryColorHex,
      loginBackgroundUrl,
      loginBackgroundType,
    };
  }

  private toAbsoluteLogoUrl(logoUrl: string): string {
    if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
      return logoUrl;
    }
    const base =
      this.configService.get<string>("RENDER_EXTERNAL_URL") ||
      this.configService.get<string>("API_URL") ||
      "http://localhost:4000";
    return `${base}${logoUrl.startsWith("/") ? "" : "/"}${logoUrl}`;
  }

  private getThemeColorHex(themeColor: string): string {
    const map: Record<string, string> = {
      purple: "#9333ea",
      blue: "#2563eb",
      green: "#16a34a",
      orange: "#ea580c",
      red: "#dc2626",
      indigo: "#4f46e5",
      pink: "#db2777",
      teal: "#0d9488",
    };
    return map[themeColor] || "#0d9488";
  }

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
        loaderLogoUrl: profile.loaderLogoUrl || null,
        faviconUrl: profile.faviconUrl || null,
        homeCardImageUrl: profile.homeCardImageUrl || null,
        requestCardImageUrl: profile.requestCardImageUrl || null,
        chatCardImageUrl: profile.chatCardImageUrl || null,
        loginBackgroundUrl: profile.loginBackgroundUrl || null,
        loginBackgroundType: profile.loginBackgroundType || null,
        themeColor: profile.themeColor || "orange",
        customColorHex: profile.customColorHex || null,
        currency: profile.currency || "GHS",
        timezone: profile.timezone || "Africa/Accra",
        address: profile.address || null,
        supportEmail: profile.supportEmail || null,
        supportPhone: profile.supportPhone || null,
        helpAssistantName: profile.helpAssistantName || null,
        helpAssistantImageUrl: profile.helpAssistantImageUrl || null,
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
          loaderLogoUrl: profile.loaderLogoUrl !== undefined ? profile.loaderLogoUrl : (currentProfile.loaderLogoUrl || null),
          faviconUrl: profile.faviconUrl !== undefined ? profile.faviconUrl : (currentProfile.faviconUrl || null),
          homeCardImageUrl: profile.homeCardImageUrl !== undefined ? (profile.homeCardImageUrl || null) : (currentProfile.homeCardImageUrl || null),
          requestCardImageUrl: profile.requestCardImageUrl !== undefined ? (profile.requestCardImageUrl || null) : (currentProfile.requestCardImageUrl || null),
          chatCardImageUrl: profile.chatCardImageUrl !== undefined ? (profile.chatCardImageUrl || null) : (currentProfile.chatCardImageUrl || null),
          loginBackgroundUrl: profile.loginBackgroundUrl !== undefined ? (profile.loginBackgroundUrl || null) : (currentProfile.loginBackgroundUrl || null),
          loginBackgroundType: profile.loginBackgroundType !== undefined ? (profile.loginBackgroundType || null) : (currentProfile.loginBackgroundType || null),
          themeColor: profile.themeColor || currentProfile.themeColor || "orange",
          customColorHex: profile.customColorHex !== undefined ? (profile.customColorHex || null) : (currentProfile.customColorHex || null),
          currency: profile.currency || currentProfile.currency || "GHS",
          timezone: profile.timezone || currentProfile.timezone || "Africa/Accra",
          address: profile.address !== undefined ? profile.address : (currentProfile.address || null),
          supportEmail: profile.supportEmail || currentProfile.supportEmail || null,
          supportPhone: profile.supportPhone || currentProfile.supportPhone || null,
          helpAssistantName: profile.helpAssistantName !== undefined ? (profile.helpAssistantName || null) : (currentProfile.helpAssistantName || null),
          helpAssistantImageUrl: profile.helpAssistantImageUrl !== undefined ? (profile.helpAssistantImageUrl || null) : (currentProfile.helpAssistantImageUrl || null),
        },
      },
    });

    const savedProfile = (await prisma.orgSetting.findUnique({ where: { orgId } }))?.profile as any || {};

    // Return in the format expected by frontend
    return {
      profile: {
        name: updated.name,
        logoUrl: savedProfile.logoUrl || null,
        loaderLogoUrl: savedProfile.loaderLogoUrl || null,
        faviconUrl: savedProfile.faviconUrl || null,
        homeCardImageUrl: savedProfile.homeCardImageUrl || null,
        requestCardImageUrl: savedProfile.requestCardImageUrl || null,
        chatCardImageUrl: savedProfile.chatCardImageUrl || null,
        loginBackgroundUrl: savedProfile.loginBackgroundUrl || null,
        loginBackgroundType: savedProfile.loginBackgroundType || null,
        themeColor: savedProfile.themeColor || "orange",
        customColorHex: savedProfile.customColorHex || null,
        currency: savedProfile.currency || "GHS",
        timezone: savedProfile.timezone || "Africa/Accra",
        address: savedProfile.address || null,
        supportEmail: savedProfile.supportEmail || null,
        supportPhone: savedProfile.supportPhone || null,
        helpAssistantName: savedProfile.helpAssistantName || null,
        helpAssistantImageUrl: savedProfile.helpAssistantImageUrl || null,
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

  /** Treat literal string "undefined" from frontend/DB as empty */
  private normalizeSettingValue(val: unknown): string {
    if (val === undefined || val === null) return "";
    const s = String(val).trim();
    return s === "undefined" || s === "null" ? "" : s;
  }

  async getSmsSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const sms = integrations.sms || {};

    const username = this.normalizeSettingValue(sms.username) || process.env.DEYWURO_USERNAME || "";
    return {
      settings: {
        provider: this.normalizeSettingValue(sms.provider) || "Deywuro",
        username,
        password: sms.password ? "***" : "",
        senderId: this.normalizeSettingValue(sms.senderId) || process.env.DEYWURO_SENDER_ID || "PoolCare",
        apiEndpoint: this.normalizeSettingValue(sms.apiEndpoint) || process.env.DEYWURO_API_ENDPOINT || "https://deywuro.com/api/sms",
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
        // User provided a new password - encrypt before storing
        finalPassword = encrypt(newPassword.trim());
      }
      // If password is undefined, empty, or masked, keep existing password (don't change it)
    }

    const username = settings.username !== undefined ? this.normalizeSettingValue(settings.username) : this.normalizeSettingValue(existingSms.username);
    const senderId = settings.senderId !== undefined ? this.normalizeSettingValue(settings.senderId) : (this.normalizeSettingValue(existingSms.senderId) || "PoolCare");
    const apiEndpoint = settings.apiEndpoint !== undefined ? this.normalizeSettingValue(settings.apiEndpoint) : (this.normalizeSettingValue(existingSms.apiEndpoint) || "https://deywuro.com/api/sms");

    integrations.sms = {
      provider: this.normalizeSettingValue(settings.provider) || existingSms.provider || "Deywuro",
      username,
      password: finalPassword,
      senderId: senderId || "PoolCare",
      apiEndpoint: apiEndpoint || "https://deywuro.com/api/sms",
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
    // Encrypt password if a new one is provided
    const existingSmtpPassword = integrations.smtp?.password || "";
    let smtpPassword = existingSmtpPassword;
    if (settings.password && settings.password !== "***" && settings.password !== "******" && settings.password !== "••••••••") {
      smtpPassword = encrypt(settings.password);
    }

    integrations.smtp = {
      host: settings.host || "",
      port: settings.port || 587,
      user: settings.user || "",
      password: smtpPassword,
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

  /** LLM settings: provider, apiKey (masked in responses), model, baseUrl (optional) */
  async getLlmSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const llm = integrations.llm || {};

    return {
      settings: {
        provider: this.normalizeSettingValue(llm.provider) || "openai",
        apiKey: llm.apiKey ? "***" : "",
        model: this.normalizeSettingValue(llm.model) || "gpt-4o-mini",
        baseUrl: this.normalizeSettingValue(llm.baseUrl) || "",
        enabled: llm.enabled !== undefined ? llm.enabled : !!llm.apiKey,
      },
    };
  }

  async updateLlmSettings(orgId: string, data: any) {
    const settings = data.settings || data;
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const existingLlm = integrations.llm || {};

    let finalApiKey = existingLlm.apiKey || "";
    if (settings.apiKey !== undefined) {
      const newApiKey = settings.apiKey;
      const isMasked =
        newApiKey === "***" ||
        newApiKey === "******" ||
        newApiKey === "••••••••";
      const isValidNew =
        newApiKey &&
        !isMasked &&
        typeof newApiKey === "string" &&
        newApiKey.trim().length > 0;
      if (isValidNew) {
        finalApiKey = newApiKey.trim();
      }
    }

    integrations.llm = {
      provider: this.normalizeSettingValue(settings.provider) || existingLlm.provider || "openai",
      apiKey: finalApiKey,
      model: this.normalizeSettingValue(settings.model) || existingLlm.model || "gpt-4o-mini",
      baseUrl: settings.baseUrl !== undefined ? this.normalizeSettingValue(settings.baseUrl) : (existingLlm.baseUrl || ""),
      enabled: settings.enabled !== undefined ? settings.enabled : (!!finalApiKey || !!existingLlm.enabled),
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return {
      settings: {
        provider: integrations.llm.provider,
        apiKey: integrations.llm.apiKey ? "***" : "",
        model: integrations.llm.model,
        baseUrl: integrations.llm.baseUrl || "",
        enabled: integrations.llm.enabled,
      },
    };
  }

  /**
   * Get LLM config for internal use (e.g. AI recommendations). Returns unmasked apiKey.
   */
  async getLlmConfig(orgId: string): Promise<{
    provider: string;
    apiKey: string | null;
    model: string;
    baseUrl: string | null;
    enabled: boolean;
  } | null> {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const llm = integrations.llm || {};
    if (!llm.enabled || !llm.apiKey) return null;
    return {
      provider: this.normalizeSettingValue(llm.provider) || "openai",
      apiKey: llm.apiKey || null,
      model: this.normalizeSettingValue(llm.model) || "gpt-4o-mini",
      baseUrl: this.normalizeSettingValue(llm.baseUrl) || null,
      enabled: !!llm.enabled,
    };
  }

  /**
   * Test LLM API connection with a minimal request. Returns success and message for UI.
   */
  async testLlmConnection(orgId: string): Promise<{ success: boolean; message: string }> {
    const config = await this.getLlmConfig(orgId);
    if (!config || !config.apiKey) {
      return { success: false, message: "LLM is not configured or disabled. Save your API key and enable the integration first." };
    }

    const testPrompt = "Reply with exactly: OK";

    if (config.provider === "anthropic") {
      const url = "https://api.anthropic.com/v1/messages";
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 16,
            messages: [{ role: "user", content: testPrompt }],
          }),
        });
        const data = (await res.json()) as any;
        if (!res.ok) {
          const err = data.error?.message || data.message || JSON.stringify(data);
          return { success: false, message: err };
        }
        const text = data.content?.[0]?.text;
        return { success: true, message: text ? `API is working. Response: ${(text as string).trim().slice(0, 50)}` : "API is working." };
      } catch (e: any) {
        return { success: false, message: e.message || "Request failed. Check network and API key." };
      }
    }

    // OpenAI or custom (OpenAI-compatible)
    const base = (config.baseUrl || "").trim() || "https://api.openai.com/v1";
    const baseUrl = base.endsWith("/") ? base.slice(0, -1) : base;
    const url = `${baseUrl}/chat/completions`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 16,
          messages: [{ role: "user", content: testPrompt }],
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        const err = data.error?.message || data.message || JSON.stringify(data);
        return { success: false, message: err };
      }
      const text = data.choices?.[0]?.message?.content;
      return { success: true, message: text ? `API is working. Response: ${(text as string).trim().slice(0, 50)}` : "API is working." };
    } catch (e: any) {
      return { success: false, message: e.message || "Request failed. Check base URL and API key." };
    }
  }

  async getTipSchedule(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const schedule = integrations.tipSchedule || {};

    return {
      enabled: schedule.enabled || false,
      monday: schedule.monday || false,
      tuesday: schedule.tuesday || false,
      wednesday: schedule.wednesday || false,
      thursday: schedule.thursday || false,
      friday: schedule.friday || false,
      saturday: schedule.saturday || false,
      sunday: schedule.sunday || false,
      lastTipIndex: schedule.lastTipIndex ?? -1,
    };
  }

  async updateTipSchedule(orgId: string, data: any) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const current = integrations.tipSchedule || {};

    const updated = {
      enabled: data.enabled !== undefined ? data.enabled : (current.enabled || false),
      monday: data.monday !== undefined ? data.monday : (current.monday || false),
      tuesday: data.tuesday !== undefined ? data.tuesday : (current.tuesday || false),
      wednesday: data.wednesday !== undefined ? data.wednesday : (current.wednesday || false),
      thursday: data.thursday !== undefined ? data.thursday : (current.thursday || false),
      friday: data.friday !== undefined ? data.friday : (current.friday || false),
      saturday: data.saturday !== undefined ? data.saturday : (current.saturday || false),
      sunday: data.sunday !== undefined ? data.sunday : (current.sunday || false),
      lastTipIndex: data.lastTipIndex !== undefined ? data.lastTipIndex : (current.lastTipIndex ?? -1),
    };

    integrations.tipSchedule = updated;

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return updated;
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

  async getPolicies(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const policies = (orgSetting.policies as any) || {};

    return {
      cancellationPolicy: policies.cancellationPolicy || "",
      serviceAgreement: policies.serviceAgreement || "",
      refundPolicy: policies.refundPolicy || "",
      paymentTerms: policies.paymentTerms || "",
    };
  }

  async updatePolicies(orgId: string, data: any) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const currentPolicies = (orgSetting.policies as any) || {};

    const updatedPolicies = {
      ...currentPolicies,
      cancellationPolicy: data.cancellationPolicy !== undefined ? data.cancellationPolicy : (currentPolicies.cancellationPolicy || ""),
      serviceAgreement: data.serviceAgreement !== undefined ? data.serviceAgreement : (currentPolicies.serviceAgreement || ""),
      refundPolicy: data.refundPolicy !== undefined ? data.refundPolicy : (currentPolicies.refundPolicy || ""),
      paymentTerms: data.paymentTerms !== undefined ? data.paymentTerms : (currentPolicies.paymentTerms || ""),
    };

    await prisma.orgSetting.update({
      where: { orgId },
      data: { policies: updatedPolicies },
    });

    return updatedPolicies;
  }

  async getDailyBriefingSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const briefing = integrations.dailyBriefing || {};
    const profile = (orgSetting.profile as any) || {};

    // Get admins/managers for selection
    const admins = await prisma.orgMember.findMany({
      where: { orgId, role: { in: ["ADMIN", "MANAGER"] } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return {
      enabled: briefing.enabled || false,
      frequency: briefing.frequency || "daily",
      sendHour: briefing.sendHour ?? 6,
      weeklyDay: briefing.weeklyDay ?? 1,
      selectedAdminIds: briefing.selectedAdminIds || [],
      customEmails: briefing.customEmails || [],
      timezone: profile.timezone || "Africa/Accra",
      availableAdmins: admins.map(a => ({
        userId: a.userId,
        name: a.user.name || a.user.email || "Unknown",
        email: a.user.email,
        role: a.role,
      })),
    };
  }

  async updateDailyBriefingSettings(orgId: string, data: any) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const current = integrations.dailyBriefing || {};

    const updated = {
      enabled: data.enabled !== undefined ? data.enabled : (current.enabled || false),
      frequency: data.frequency || current.frequency || "daily",
      sendHour: data.sendHour !== undefined ? data.sendHour : (current.sendHour ?? 6),
      weeklyDay: data.weeklyDay !== undefined ? data.weeklyDay : (current.weeklyDay ?? 1),
      selectedAdminIds: data.selectedAdminIds !== undefined ? data.selectedAdminIds : (current.selectedAdminIds || []),
      customEmails: data.customEmails !== undefined ? data.customEmails : (current.customEmails || []),
    };

    integrations.dailyBriefing = updated;

    // Update timezone in profile if provided
    if (data.timezone) {
      const profile = (orgSetting.profile as any) || {};
      profile.timezone = data.timezone;
      await prisma.orgSetting.update({
        where: { orgId },
        data: { integrations, profile },
      });
    } else {
      await prisma.orgSetting.update({
        where: { orgId },
        data: { integrations },
      });
    }

    return updated;
  }

  async getJobGenerationSettings(orgId: string) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const policies = (orgSetting.policies as any) || {};
    const jobGen = policies.jobGeneration || {};

    return {
      enabled: jobGen.enabled || false,
      horizonDays: jobGen.horizonDays || 56,
    };
  }

  async updateJobGenerationSettings(orgId: string, data: any) {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const policies = (orgSetting.policies as any) || {};
    const current = policies.jobGeneration || {};

    const updated = {
      enabled: data.enabled !== undefined ? data.enabled : (current.enabled || false),
      horizonDays: data.horizonDays !== undefined ? data.horizonDays : (current.horizonDays || 56),
    };

    policies.jobGeneration = updated;

    await prisma.orgSetting.update({
      where: { orgId },
      data: { policies },
    });

    return updated;
  }
}

