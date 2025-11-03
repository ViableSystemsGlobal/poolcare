import { IsString, IsOptional, IsEnum } from "class-validator";

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsEnum(["WHATSAPP", "SMS", "EMAIL"])
  preferredChannel?: string;
}

