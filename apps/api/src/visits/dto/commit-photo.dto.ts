import { IsString, IsEnum, IsOptional, IsObject, IsDateString } from "class-validator";

export class CommitPhotoDto {
  @IsString()
  key: string;

  @IsEnum(["before", "after", "issue"])
  label: string;

  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @IsOptional()
  @IsObject()
  meta?: any; // exif, width, height
}

