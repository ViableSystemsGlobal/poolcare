import { IsString, IsOptional, IsInt, Min, IsEnum } from "class-validator";

export class InitPaymentDto {
  @IsOptional()
  @IsEnum(["card", "mobile_money", "bank_transfer", "cash"])
  method?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}

