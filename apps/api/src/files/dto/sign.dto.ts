import { IsString, IsOptional, IsNumber, IsEnum } from "class-validator";

export class SignDto {
  @IsString()
  fileId: string;

  @IsOptional()
  @IsEnum(["original", "xl", "thumb"])
  variant?: string;

  @IsOptional()
  @IsNumber()
  ttlSec?: number;
}

