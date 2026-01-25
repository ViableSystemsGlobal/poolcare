import { IsString, IsOptional, IsInt, IsNumber, IsEnum, IsDateString, IsObject, ValidateNested, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

class WindowDto {
  @IsString()
  start: string; // HH:MM

  @IsString()
  end: string; // HH:MM
}

export class CreatePlanDto {
  @IsString()
  poolId: string;

  @IsEnum(["weekly", "biweekly", "monthly", "once_week", "twice_week", "once_month", "twice_month"])
  frequency: string;

  @IsOptional()
  @IsString()
  dow?: string; // mon, tue, etc.

  @IsOptional()
  @IsInt()
  dom?: number; // 1-28 or -1

  @IsOptional()
  @ValidateNested()
  @Type(() => WindowDto)
  window?: WindowDto;

  @IsInt()
  priceCents: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  taxPct?: number;

  @IsOptional()
  @IsNumber()
  discountPct?: number;

  @IsOptional()
  @IsString()
  visitTemplateId?: string;

  @IsOptional()
  @IsInt()
  visitTemplateVersion?: number;

  @IsOptional()
  @IsInt()
  serviceDurationMin?: number;

  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Subscription fields
  @IsOptional()
  @IsString()
  @IsEnum(["per_visit", "monthly", "quarterly", "annually"])
  billingType?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsString()
  templateId?: string; // Create from subscription template
}

