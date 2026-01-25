import { IsString, IsOptional, IsEnum, IsArray } from "class-validator";

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

