import { IsOptional, IsNumber, IsDateString, Min, Max } from "class-validator";

export class AddReadingDto {
  @IsOptional()
  @IsNumber()
  @Min(6.2)
  @Max(8.6)
  ph?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  chlorineFree?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  chlorineTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(40)
  @Max(240)
  alkalinity?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(600)
  calciumHardness?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  cyanuricAcid?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(45)
  tempC?: number;

  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}

