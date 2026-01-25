import { IsString, IsNumber, IsOptional, IsObject } from "class-validator";

export class CreateRefundDto {
  @IsString()
  paymentId: string;

  @IsNumber()
  amountCents: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

