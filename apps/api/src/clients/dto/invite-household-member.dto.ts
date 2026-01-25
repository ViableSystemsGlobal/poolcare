import { IsString, IsEmail, IsOptional } from "class-validator";

export class InviteHouseholdMemberDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  message?: string; // Custom invitation message
}
