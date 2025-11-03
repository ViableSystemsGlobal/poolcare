import { IsString, IsOptional, IsBoolean, IsObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class HomeBaseDto {
  @IsOptional()
  lat?: number;

  @IsOptional()
  lng?: number;
}

export class UpdateCarerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => HomeBaseDto)
  homeBase?: HomeBaseDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

