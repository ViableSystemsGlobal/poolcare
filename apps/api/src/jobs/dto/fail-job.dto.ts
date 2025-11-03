import { IsEnum, IsOptional, IsString } from "class-validator";

export class FailJobDto {
  @IsEnum(["NO_ACCESS", "CLIENT_ABSENT", "EQUIP_FAILURE", "OTHER"])
  code: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

