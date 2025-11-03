import { IsOptional, IsDateString } from "class-validator";

export class SendInvoiceDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

