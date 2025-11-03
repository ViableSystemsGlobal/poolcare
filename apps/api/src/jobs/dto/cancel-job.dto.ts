import { IsEnum, IsOptional, IsString } from "class-validator";

export class CancelJobDto {
  @IsEnum(["CLIENT_REQUEST", "WEATHER", "OTHER"])
  code: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

