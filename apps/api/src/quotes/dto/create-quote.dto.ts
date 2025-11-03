import { IsString, IsOptional, IsArray, ValidateNested, IsInt, IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";

class QuoteItemDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  label: string;

  @IsNumber()
  @Min(0.01)
  qty: number;

  @IsInt()
  @Min(0)
  unitPriceCents: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPct?: number;
}

export class CreateQuoteDto {
  @IsOptional()
  @IsString()
  issueId?: string;

  @IsString()
  poolId: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

