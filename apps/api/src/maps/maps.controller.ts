import { Controller, Post, Get, Body, Query, UseGuards, Inject, forwardRef } from "@nestjs/common";
import { MapsService } from "./maps.service";
import { SettingsService } from "../settings/settings.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("maps")
@UseGuards(JwtAuthGuard)
export class MapsController {
  constructor(
    private readonly mapsService: MapsService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService
  ) {}

  @Post("verify-api-key")
  async verifyApiKey(@CurrentUser() user: any, @Body() body: { apiKey?: string }) {
    // Get org-specific API key if not provided
    const orgApiKey = body.apiKey || await this.settingsService.getGoogleMapsApiKey(user.org_id);
    return this.mapsService.verifyApiKey(orgApiKey);
  }

  @Get("status")
  async getStatus(@CurrentUser() user: any) {
    // Get org-specific API key
    const orgApiKey = await this.settingsService.getGoogleMapsApiKey(user.org_id);
    const hasOrgKey = !!orgApiKey;
    const maskedKey = orgApiKey 
      ? orgApiKey.substring(0, 8) + "..." + orgApiKey.substring(orgApiKey.length - 4)
      : null;
    
    return {
      configured: hasOrgKey,
      maskedApiKey: maskedKey,
      orgId: user.org_id,
      message: hasOrgKey 
        ? "Google Maps API key is configured. If you're getting REQUEST_DENIED errors, please verify in Google Cloud Console that: 1) Geocoding API is enabled, 2) API key has no IP restrictions or your server IP is allowed."
        : "No Google Maps API key configured. Please add your API key in Settings → Integrations → Google Maps."
    };
  }

  @Post("geocode")
  async geocode(@CurrentUser() user: any, @Body() body: { address: string; apiKey?: string }) {
    // Get org-specific API key if not provided
    const orgApiKey = body.apiKey || await this.settingsService.getGoogleMapsApiKey(user.org_id);
    return this.mapsService.geocode(body.address, orgApiKey);
  }

  @Post("reverse-geocode")
  async reverseGeocode(@CurrentUser() user: any, @Body() body: { lat: number; lng: number; apiKey?: string }) {
    // Get org-specific API key if not provided
    const orgApiKey = body.apiKey || await this.settingsService.getGoogleMapsApiKey(user.org_id);
    return this.mapsService.reverseGeocode(body.lat, body.lng, orgApiKey);
  }

  @Post("distance")
  async calculateDistance(
    @CurrentUser() user: any,
    @Body()
    body: {
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
      mode?: "driving" | "walking" | "bicycling" | "transit";
      apiKey?: string;
    }
  ) {
    // Get org-specific API key if not provided
    const orgApiKey = body.apiKey || await this.settingsService.getGoogleMapsApiKey(user.org_id);
    return this.mapsService.calculateDistance(
      body.origin,
      body.destination,
      body.mode || "driving",
      orgApiKey
    );
  }

  @Post("directions")
  async getDirections(
    @CurrentUser() user: any,
    @Body()
    body: {
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
      mode?: "driving" | "walking" | "bicycling" | "transit";
      apiKey?: string;
    }
  ) {
    // Get org-specific API key if not provided
    const orgApiKey = body.apiKey || await this.settingsService.getGoogleMapsApiKey(user.org_id);
    return this.mapsService.getDirections(
      body.origin,
      body.destination,
      body.mode || "driving",
      orgApiKey
    );
  }
}

