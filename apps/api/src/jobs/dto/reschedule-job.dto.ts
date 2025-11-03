import { IsDateString, IsOptional, IsString } from "class-validator";

export class RescheduleJobDto {
  @IsDateString()
  windowStart: string;

  @IsDateString()
  windowEnd: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

