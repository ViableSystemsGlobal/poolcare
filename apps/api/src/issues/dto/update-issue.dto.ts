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

  // How the concern was resolved; sent to the client for complaints.
  @IsOptional()
  @IsString()
  resolution?: string;
}

