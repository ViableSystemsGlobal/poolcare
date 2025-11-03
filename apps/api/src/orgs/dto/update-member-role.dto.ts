import { IsEnum, IsOptional } from "class-validator";

export class UpdateMemberRoleDto {
  @IsOptional()
  @IsEnum(["ADMIN", "MANAGER", "CARER", "CLIENT"])
  role?: string;
}

