import { IsString, IsOptional, IsInt, IsBoolean, IsEmail, Min, Max, IsIn } from "class-validator";
import { Type, Transform } from "class-transformer";

const toBool = ({ value }: { value: any }) => (value === "true" ? true : value === "false" ? false : value);

export class MailAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  imapHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort?: number;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  imapSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  signature?: string;
}

export class UpdateMailAccountDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}

export class MessageFlagsDto {
  @IsString()
  folder: string;

  @IsOptional()
  @IsBoolean()
  seen?: boolean;

  @IsOptional()
  @IsBoolean()
  flagged?: boolean;
}

export class MoveMessageDto {
  @IsString()
  folder: string;

  @IsString()
  to: string;
}

// Multipart form fields, so everything arrives as a string.
export class SendMailDto {
  @IsString()
  to: string; // comma-separated

  @IsOptional()
  @IsString()
  cc?: string;

  @IsOptional()
  @IsString()
  bcc?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsString()
  text?: string;

  // Original message when replying or forwarding
  @IsOptional()
  @IsIn(["reply", "forward"])
  mode?: "reply" | "forward";

  @IsOptional()
  @IsString()
  refFolder?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  refUid?: number;
}
