import { IsOptional, IsObject, IsDateString, IsNumber } from "class-validator";

export class ArriveJobDto {
  @IsOptional()
  @IsObject()
  location?: { lat: number; lng: number; accuracyM?: number };

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

