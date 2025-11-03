import { IsDateString, IsString, IsOptional } from "class-validator";

export class CreateJobFromQuoteDto {
  @IsDateString()
  windowStart: string;

  @IsDateString()
  windowEnd: string;

  @IsOptional()
  @IsString()
  assignedCarerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

