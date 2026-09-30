import { IsString, IsArray, IsOptional, IsInt, IsNumber, IsEnum, IsDateString, IsObject, ValidateNested, Min } from "class-validator";
import { Type } from "class-transformer";

class WindowDto {
  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class UpdatePlanDto {
  // Schedule B "Contracted Visits" per prepaid term; null clears the override.
  @IsOptional()
  @IsInt()
  @Min(0)
  visitsPerTerm?: number | null;

  // Schedule B: included Emergency Cleaning Visits per calendar month.
  @IsOptional()
  @IsInt()
  @Min(0)
  emergencyVisitsPerMonth?: number | null;

  // Schedule B: monthly routine-chemical allowance in minor units (pesewas).
  @IsOptional()
  @IsInt()
  @Min(0)
  chemicalAllowanceCents?: number | null;

  // Schedule B Standard Rate (minor units): values delivered visits on refunds.
  @IsOptional()
  @IsInt()
  @Min(0)
  standardRateCents?: number | null;

  // Schedule B: authorised app users [{ name, contact, role }] (cl. 12.1(h)).
  @IsOptional()
  @IsArray()
  authorisedUsers?: Array<{ name: string; contact?: string; role?: string }>;

  // Schedule B B7: special conditions / approved variations.
  @IsOptional()
  @IsString()
  specialConditions?: string | null;

  @IsOptional()
  @IsEnum(["weekly", "biweekly", "monthly", "once_week", "twice_week", "thrice_week", "once_month", "twice_month", "thrice_month"])
  frequency?: string;

  @IsOptional()
  @IsString()
  dow?: string;

  @IsOptional()
  @IsInt()
  dom?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => WindowDto)
  window?: WindowDto;

  @IsOptional()
  @IsInt()
  priceCents?: number;

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
  endsOn?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  preferredCarerId?: string | null; // null to clear the preferred carer
}

