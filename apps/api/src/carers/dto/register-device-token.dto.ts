import { IsString, IsEnum } from "class-validator";

export class RegisterDeviceTokenDto {
  @IsString()
  token: string;

  @IsEnum(["ios", "android", "web"])
  platform: string;
}

