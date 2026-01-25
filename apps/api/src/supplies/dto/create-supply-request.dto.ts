import { IsArray, IsString, IsOptional, IsEnum, ValidateNested, IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";

export class SupplyItemDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateSupplyRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplyItemDto)
  items: SupplyItemDto[];

  @IsEnum(["low", "normal", "high", "urgent"])
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

