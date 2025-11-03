import { IsString, IsOptional, IsInt, IsNumber, IsEnum, IsDateString, IsObject, ValidateNested } from "class-validator";
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

  @IsEnum(["weekly", "biweekly", "monthly"])
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
}

