import { IsString, IsObject, ValidateNested, IsOptional } from "class-validator";
import { Type } from "class-transformer";

class WindowDto {
  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class OverrideWindowDto {
  @IsString()
  date: string; // YYYY-MM-DD

  @ValidateNested()
  @Type(() => WindowDto)
  window: WindowDto;

  @IsOptional()
  @IsString()
  reason?: string;
}

