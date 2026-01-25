import { IsString, IsOptional, IsInt, IsNumber, IsEnum, IsDateString, IsObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class WindowDto {
  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsEnum(["weekly", "biweekly", "monthly", "once_week", "twice_week", "once_month", "twice_month"])
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
}

