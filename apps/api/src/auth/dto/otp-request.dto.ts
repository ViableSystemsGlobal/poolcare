import { IsEnum, IsString } from "class-validator";

export class OtpRequestDto {
  @IsEnum(["phone", "email"])
  channel: "phone" | "email";

  @IsString()
  target: string;
}

