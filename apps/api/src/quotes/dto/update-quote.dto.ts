import { IsString, IsOptional, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class QuoteItemDto {
  sku?: string;
  label: string;
  qty: number;
  unitPriceCents: number;
  taxPct?: number;
}

export class UpdateQuoteDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

