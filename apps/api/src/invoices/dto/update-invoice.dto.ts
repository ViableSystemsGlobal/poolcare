import { IsOptional, IsArray, ValidateNested, IsDateString, IsString } from "class-validator";
import { Type } from "class-transformer";

class InvoiceItemDto {
  sku?: string;
  label: string;
  qty: number;
  unitPriceCents: number;
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

