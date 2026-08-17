import {
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsString,
  IsInt,
  IsNumber,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

class InvoiceItemDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  label: string;

  @IsInt()
  @Min(1)
  qty: number;

  @IsInt()
  @Min(0)
  unitPriceCents: number;

  // Percentages are legitimately fractional (e.g. 12.5% VAT)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
