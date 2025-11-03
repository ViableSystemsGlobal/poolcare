import { IsEnum, IsString } from "class-validator";

export class OtpVerifyDto {
  @IsEnum(["phone", "email"])
  channel: "phone" | "email";

  @IsString()
  target: string;

  @IsString()
  code: string;
}

