import { IsString, IsOptional, IsArray, ValidateNested, IsDateString, IsInt, Min } from "class-validator";
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

  @IsOptional()
  @IsInt()
  @Min(0)
  taxPct?: number;
}

export class CreateInvoiceDto {
  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  poolId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  quoteId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

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

