import { IsString, IsOptional, IsInt, IsNumber, IsBoolean, IsEnum, IsObject } from "class-validator";
import { CreateTemplateDto } from "./create-template.dto";

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(["weekly", "biweekly", "monthly", "once_week", "twice_week", "once_month", "twice_month"])
  frequency?: string;

  @IsOptional()
  @IsEnum(["per_visit", "monthly", "quarterly", "annually"])
  billingType?: string;

  @IsOptional()
  @IsInt()
  priceCents?: number;

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
  @IsInt()
  serviceDurationMin?: number;

  @IsOptional()
  @IsString()
  visitTemplateId?: string;

  @IsOptional()
  @IsBoolean()
  includesChemicals?: boolean;

  @IsOptional()
  @IsInt()
  maxVisitsPerMonth?: number;

  @IsOptional()
  @IsInt()
  trialDays?: number;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

