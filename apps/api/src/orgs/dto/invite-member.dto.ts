import { IsString, IsEnum, IsOptional } from "class-validator";

export class InviteMemberDto {
  @IsString()
  target: string; // phone or email

  @IsEnum(["ADMIN", "MANAGER", "CARER", "CLIENT"])
  role: string;

  @IsOptional()
  @IsString()
  name?: string;
}

