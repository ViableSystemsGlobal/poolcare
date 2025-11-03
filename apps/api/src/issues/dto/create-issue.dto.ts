import { IsString, IsEnum, IsBoolean, IsOptional, IsArray } from "class-validator";

export class CreateIssueDto {
  @IsOptional()
  @IsString()
  visitId?: string;

  @IsString()
  poolId: string;

  @IsString()
  type: string;

  @IsEnum(["low", "medium", "high", "critical"])
  severity: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsBoolean()
  requiresQuote?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[]; // Photo IDs
}

