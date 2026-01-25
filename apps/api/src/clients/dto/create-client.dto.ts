import { IsString, IsOptional, IsEnum, IsUUID, IsArray } from "class-validator";

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
  imageUrl?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(["WHATSAPP", "SMS", "EMAIL"], { each: true })
  preferredChannels?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

