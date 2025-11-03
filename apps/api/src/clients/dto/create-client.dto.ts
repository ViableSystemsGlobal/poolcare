import { IsString, IsOptional, IsEnum, IsUUID } from "class-validator";

export class CreateClientDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  name: string;

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

