import { IsEnum, IsOptional, IsString } from "class-validator";

export class OtpVerifyDto {
  @IsEnum(["phone", "email"])
  channel: "phone" | "email";

  @IsString()
  target: string;

  @IsString()
  code: string;

  /** Which app is logging in: admin/carer = invite-only, client = self-signup allowed */
  @IsOptional()
  @IsEnum(["admin", "carer", "client"])
  app?: "admin" | "carer" | "client";
}

