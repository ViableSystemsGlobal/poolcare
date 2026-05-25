import { IsString, IsOptional, IsInt, IsNumber, IsBoolean, IsEnum, IsObject, Min, Max } from "class-validator";

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(["weekly", "biweekly", "monthly", "once_week", "twice_week", "once_month", "twice_month"])
  frequency: string;

  @IsEnum(["per_visit", "monthly", "quarterly", "annually"])
  @IsOptional()
  billingType?: string;

  @IsOptional()
  @IsEnum(["fixed", "range"])
  pricingType?: string;

  // Required when pricingType = "fixed" (cross-field validation in service)
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  // Required when pricingType = "range" (cross-field validation in service)
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMaxCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  serviceDurationMin?: number;

  @IsOptional()
  @IsString()
  visitTemplateId?: string;

  @IsOptional()
  @IsBoolean()
  includesChemicals?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxVisitsPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, any>;
}

