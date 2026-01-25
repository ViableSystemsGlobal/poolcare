import { IsEnum, IsString, IsOptional } from "class-validator";

export class UpdateSupplyRequestDto {
  @IsEnum(["pending", "approved", "fulfilled", "rejected", "cancelled"])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}

