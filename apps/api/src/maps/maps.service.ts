import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId?: string;
}

export interface DistanceMatrixResult {
  distanceMeters: number;
  durationSeconds: number;
  durationText: string;
  distanceText: string;
}

// Google Maps API Response Types
interface GeocodeApiResponse {
  status: string;
  results?: Array<{
    formatted_address: string;
    place_id: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
}

interface DistanceMatrixApiResponse {
  status: string;
  rows?: Array<{
    elements: Array<{
      status: string;
      distance?: {
        value: number;
        text: string;
      };
      duration?: {
        value: number;
        text: string;
      };
    }>;
  }>;
}

interface DirectionsApiResponse {
  status: string;
  routes?: Array<any>;
}

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly defaultApiKey: string;
  private readonly baseUrl = "https://maps.googleapis.com/maps/api";

  constructor(private readonly configService: ConfigService) {
    this.defaultApiKey = this.configService.get<string>("GOOGLE_MAPS_API_KEY") || "";
    if (!this.defaultApiKey) {
      this.logger.warn("GOOGLE_MAPS_API_KEY not set. Maps features will be limited.");
    }
  }

  /**
   * Get API key to use (org-specific or default)
   */
  private getApiKey(orgApiKey?: string | null): string {
    return orgApiKey || this.defaultApiKey;
  }

  /**
   * Verify that a Google Maps API key is valid by making a test geocode request
   */
  async verifyApiKey(apiKey?: string | null): Promise<{ valid: boolean; message?: string }> {
    const key = this.getApiKey(apiKey);
    
    if (!key) {
      return { valid: false, message: "No API key provided" };
    }

    try {
      // Test with a simple, well-known address
      const testAddress = "1600 Amphitheatre Parkway, Mountain View, CA";
      const encodedAddress = encodeURIComponent(testAddress);
      const url = `${this.baseUrl}/geocode/json?address=${encodedAddress}&key=${key}`;

      const response = await fetch(url);
      const data = (await response.json()) as GeocodeApiResponse;

      if (data.status === "OK") {
        return { valid: true };
      } else if (data.status === "REQUEST_DENIED") {
        return { valid: false, message: "API key is invalid or restricted" };
      } else if (data.status === "OVER_QUERY_LIMIT") {
        return { valid: false, message: "API key has exceeded quota" };
      } else {
        return { valid: false, message: `API key validation failed: ${data.status}` };
      }
    } catch (error: any) {
      this.logger.error(`API key verification failed`, error);
      return { valid: false, message: `Verification error: ${error.message}` };
    }
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(address: string, orgApiKey?: string | null): Promise<GeocodeResult> {
    const apiKey = this.getApiKey(orgApiKey);
    if (!apiKey) {
      throw new BadRequestException("Google Maps API key not configured");
    }

    try {
      const encodedAddress = encodeURIComponent(address);
      const url = `${this.baseUrl}/geocode/json?address=${encodedAddress}&key=${apiKey}`;

      const response = await fetch(url);
      const data = (await response.json()) as GeocodeApiResponse;

      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        let errorMessage = `Geocoding failed: ${data.status}`;
        
        // Provide helpful error messages for common issues
        if (data.status === "REQUEST_DENIED") {
          errorMessage = "Google Maps API request denied. Please check: 1) Geocoding API is enabled in Google Cloud Console, 2) API key restrictions allow server-side requests, 3) API key has Geocoding API permission.";
        } else if (data.status === "OVER_QUERY_LIMIT") {
          errorMessage = "Google Maps API quota exceeded. Please check your usage limits in Google Cloud Console.";
        } else if (data.status === "INVALID_REQUEST") {
          errorMessage = "Invalid address provided for geocoding.";
        }
        
        throw new BadRequestException(errorMessage);
      }

      const result = data.results[0];
      const location = result.geometry.location;

      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
      };
    } catch (error: any) {
      this.logger.error(`Geocoding failed for address: ${address}`, error);
      throw new BadRequestException(`Failed to geocode address: ${error.message}`);
    }
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(lat: number, lng: number, orgApiKey?: string | null): Promise<GeocodeResult> {
    const apiKey = this.getApiKey(orgApiKey);
    if (!apiKey) {
      throw new BadRequestException("Google Maps API key not configured");
    }

    // Log API key info for debugging (masked)
    const maskedKey = apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4);
    this.logger.log(`Reverse geocoding ${lat},${lng} with API key: ${maskedKey}`);

    try {
      const url = `${this.baseUrl}/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

      const response = await fetch(url);
      const data = (await response.json()) as GeocodeApiResponse;
      
      // Log the response status for debugging
      this.logger.log(`Google Maps API response status: ${data.status}`);

      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        let errorMessage = `Reverse geocoding failed: ${data.status}`;
        
        // Provide helpful error messages for common issues
        if (data.status === "REQUEST_DENIED") {
          errorMessage = "Google Maps API request denied. Please check: 1) Geocoding API is enabled in Google Cloud Console, 2) API key restrictions allow server-side requests, 3) API key has Geocoding API permission.";
        } else if (data.status === "OVER_QUERY_LIMIT") {
          errorMessage = "Google Maps API quota exceeded. Please check your usage limits in Google Cloud Console.";
        } else if (data.status === "INVALID_REQUEST") {
          errorMessage = "Invalid coordinates provided for reverse geocoding.";
        }
        
        throw new BadRequestException(errorMessage);
      }

      const result = data.results[0];
      const location = result.geometry.location;

      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
      };
    } catch (error: any) {
      this.logger.error(`Reverse geocoding failed for ${lat}, ${lng}`, error);
      throw new BadRequestException(`Failed to reverse geocode: ${error.message}`);
    }
  }

  /**
   * Calculate distance and duration between two points using Google Maps
   * This provides more accurate distance than Haversine (accounts for roads, obstacles)
   */
  async calculateDistance(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: "driving" | "walking" | "bicycling" | "transit" = "driving",
    orgApiKey?: string | null
  ): Promise<DistanceMatrixResult> {
    const apiKey = this.getApiKey(orgApiKey);
    if (!apiKey) {
      throw new BadRequestException("Google Maps API key not configured");
    }

    try {
      const originStr = `${origin.lat},${origin.lng}`;
      const destStr = `${destination.lat},${destination.lng}`;
      const url = `${this.baseUrl}/distancematrix/json?origins=${originStr}&destinations=${destStr}&mode=${mode}&key=${apiKey}`;

      const response = await fetch(url);
      const data = (await response.json()) as DistanceMatrixApiResponse;

      if (data.status !== "OK" || !data.rows || data.rows.length === 0) {
        throw new BadRequestException(`Distance calculation failed: ${data.status}`);
      }

      const element = data.rows[0].elements[0];

      if (element.status !== "OK") {
        throw new BadRequestException(`Distance calculation failed: ${element.status}`);
      }

      return {
        distanceMeters: element.distance.value,
        durationSeconds: element.duration.value,
        distanceText: element.distance.text,
        durationText: element.duration.text,
      };
    } catch (error: any) {
      this.logger.error(
        `Distance calculation failed from ${origin.lat},${origin.lng} to ${destination.lat},${destination.lng}`,
        error
      );
      throw new BadRequestException(`Failed to calculate distance: ${error.message}`);
    }
  }

  /**
   * Calculate ETAs for multiple destinations from a single origin
   * Useful for route optimization
   */
  async calculateMultipleDistances(
    origin: { lat: number; lng: number },
    destinations: Array<{ lat: number; lng: number }>,
    mode: "driving" | "walking" | "bicycling" | "transit" = "driving",
    orgApiKey?: string | null
  ): Promise<DistanceMatrixResult[]> {
    const apiKey = this.getApiKey(orgApiKey);
    if (!apiKey) {
      throw new BadRequestException("Google Maps API key not configured");
    }

    if (destinations.length === 0) {
      return [];
    }

    try {
      const originStr = `${origin.lat},${origin.lng}`;
      const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join("|");
      const url = `${this.baseUrl}/distancematrix/json?origins=${originStr}&destinations=${destStr}&mode=${mode}&key=${apiKey}`;

      const response = await fetch(url);
      const data = (await response.json()) as DistanceMatrixApiResponse;

      if (data.status !== "OK" || !data.rows || data.rows.length === 0) {
        throw new BadRequestException(`Distance calculation failed: ${data.status}`);
      }

      return data.rows[0].elements.map((element: any) => {
        if (element.status !== "OK") {
          return {
            distanceMeters: 0,
            durationSeconds: 0,
            distanceText: "N/A",
            durationText: "N/A",
          };
        }

        return {
          distanceMeters: element.distance.value,
          durationSeconds: element.duration.value,
          distanceText: element.distance.text,
          durationText: element.duration.text,
        };
      });
    } catch (error: any) {
      this.logger.error(`Multiple distance calculation failed`, error);
      throw new BadRequestException(`Failed to calculate distances: ${error.message}`);
    }
  }

  /**
   * Get directions between two points
   */
  async getDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: "driving" | "walking" | "bicycling" | "transit" = "driving",
    orgApiKey?: string | null
  ): Promise<any> {
    const apiKey = this.getApiKey(orgApiKey);
    if (!apiKey) {
      throw new BadRequestException("Google Maps API key not configured");
    }

    try {
      const originStr = `${origin.lat},${origin.lng}`;
      const destStr = `${destination.lat},${destination.lng}`;
      const url = `${this.baseUrl}/directions/json?origin=${originStr}&destination=${destStr}&mode=${mode}&key=${apiKey}`;

      const response = await fetch(url);
      const data = (await response.json()) as DirectionsApiResponse;

      if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
        throw new BadRequestException(`Directions failed: ${data.status}`);
      }

      return data.routes[0];
    } catch (error: any) {
      this.logger.error(`Directions failed`, error);
      throw new BadRequestException(`Failed to get directions: ${error.message}`);
    }
  }
}

