import { IsString, IsOptional, IsBoolean, IsObject, ValidateNested, IsUUID } from "class-validator";
import { Type } from "class-transformer";

class HomeBaseDto {
  @IsOptional()
  lat?: number;

  @IsOptional()
  lng?: number;
}

export class CreateCarerDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => HomeBaseDto)
  homeBase?: HomeBaseDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

