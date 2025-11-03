import { IsOptional, IsString, IsInt, Min, Max } from "class-validator";

export class CompleteVisitDto {
  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}

