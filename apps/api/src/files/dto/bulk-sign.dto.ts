import { IsArray, IsString, IsOptional, IsNumber, IsEnum } from "class-validator";

export class BulkSignDto {
  @IsArray()
  @IsString({ each: true })
  fileIds: string[];

  @IsOptional()
  @IsEnum(["original", "xl", "thumb"])
  variant?: string;

  @IsOptional()
  @IsNumber()
  ttlSec?: number;
}

