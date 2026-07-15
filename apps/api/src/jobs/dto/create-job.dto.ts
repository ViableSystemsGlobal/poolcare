import { IsString, IsOptional, IsUUID, IsDateString } from "class-validator";

export class CreateJobDto {
  @IsUUID()
  poolId: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsDateString()
  windowStart: string;

  @IsDateString()
  windowEnd: string;

  @IsOptional()
  @IsUUID()
  assignedCarerId?: string;

  /** Visit checklist template for this job (defaults to the plan's template). */
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

