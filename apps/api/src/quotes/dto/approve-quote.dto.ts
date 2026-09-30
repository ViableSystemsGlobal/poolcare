import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ApproveQuoteDto {
  @IsOptional()
  @IsString()
  approvedBy?: string;

  // Admin only: schedule the work now instead of waiting for the quote invoice
  // to be paid (contract cl. 16.2 allows this when agreed in writing).
  @IsOptional()
  @IsBoolean()
  skipPrepayment?: boolean;
}
