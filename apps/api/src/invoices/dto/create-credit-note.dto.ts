import { IsString, IsOptional, IsNumber, IsArray, IsObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class CreditNoteItemDto {
  @IsString()
  label: string;

  @IsNumber()
  qty: number;

  @IsNumber()
  unitPriceCents: number;

  @IsOptional()
  @IsNumber()
  taxPct?: number;
}

export class CreateCreditNoteDto {
  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteItemDto)
  items: CreditNoteItemDto[];
}

