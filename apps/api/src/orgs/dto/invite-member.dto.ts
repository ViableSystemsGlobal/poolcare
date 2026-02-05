import { IsString, IsEnum, IsOptional } from "class-validator";

export class InviteMemberDto {
  /** Single target (phone or email) – kept for backwards compatibility */
  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(["ADMIN", "MANAGER", "CARER", "CLIENT"])
  role: string;

  @IsOptional()
  @IsString()
  name?: string;
}

