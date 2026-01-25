import { IsOptional, IsString } from "class-validator";

export class CancelPlanDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

