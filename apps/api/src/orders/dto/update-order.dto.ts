import { IsString, IsIn, IsOptional } from "class-validator";

const ALLOWED_STATUSES = ["pending", "confirmed", "fulfilled", "cancelled"] as const;

export class UpdateOrderDto {
  @IsString()
  @IsIn(ALLOWED_STATUSES)
  status: (typeof ALLOWED_STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
