import { IsString, IsOptional, IsNumber, IsPositive } from "class-validator";

export class AddChemicalDto {
  @IsString()
  chemical: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  qty?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  lotNo?: string;

  @IsOptional()
  @IsNumber()
  costCents?: number;
}

