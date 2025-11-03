import { IsString, IsOptional, IsNumber, IsEnum } from "class-validator";

export class PresignDto {
  @IsEnum([
    "visit_photo",
    "visit_signature",
    "pool_attachment",
    "issue_photo",
    "quote_attachment",
    "invoice_pdf",
    "receipt_pdf",
    "report_html",
    "report_pdf",
    "user_avatar",
    "misc",
  ])
  scope: string;

  @IsString()
  refId: string;

  @IsString()
  contentType: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsNumber()
  sizeBytes?: number;
}

