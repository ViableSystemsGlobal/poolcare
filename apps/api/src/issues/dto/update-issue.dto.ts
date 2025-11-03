import { IsEnum, IsString, IsBoolean, IsOptional } from "class-validator";

export class UpdateIssueDto {
  @IsOptional()
  @IsEnum(["open", "quoted", "scheduled", "resolved", "dismissed"])
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  requiresQuote?: boolean;
}

