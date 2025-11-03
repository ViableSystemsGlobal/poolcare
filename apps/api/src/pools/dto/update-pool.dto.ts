import { IsString, IsOptional, IsNumber, IsObject } from "class-validator";

export class UpdatePoolDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsNumber()
  volumeL?: number;

  @IsOptional()
  @IsString()
  surfaceType?: string;

  @IsOptional()
  @IsObject()
  equipment?: any;

  @IsOptional()
  @IsObject()
  targets?: any;

  @IsOptional()
  @IsString()
  notes?: string;
}

