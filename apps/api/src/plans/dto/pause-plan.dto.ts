import { IsDateString, IsOptional } from "class-validator";

export class PausePlanDto {
  @IsOptional()
  @IsDateString()
  until?: string;
}

