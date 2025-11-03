import { IsString, IsOptional, IsEnum, IsObject } from "class-validator";

export class SendNotificationDto {
  @IsOptional()
  @IsString()
  recipientId?: string;

  @IsOptional()
  @IsEnum(["user", "org", "client", "carer"])
  recipientType?: string;

  @IsEnum(["email", "sms", "push", "whatsapp"])
  channel: string;

  @IsString()
  to: string; // phone number, email, etc.

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

