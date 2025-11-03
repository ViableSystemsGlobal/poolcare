import { IsOptional, IsObject, IsInt } from "class-validator";

export class StartJobDto {
  @IsOptional()
  @IsObject()
  location?: { lat: number; lng: number; accuracyM?: number };

  @IsOptional()
  @IsInt()
  etaMinutes?: number;
}

