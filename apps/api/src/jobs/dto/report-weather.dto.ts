import { IsString, IsOptional, IsObject } from "class-validator";

export class ReportWeatherDto {
  @IsString()
  condition: "rain" | "storm" | "extreme_heat" | "other";

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  location?: { lat: number; lng: number; accuracyM?: number };

  @IsOptional()
  @IsString()
  photoUrl?: string; // Photo proof of weather condition
}

