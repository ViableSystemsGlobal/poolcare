import { IsDateString, IsOptional } from "class-validator";

export class DispatchOptimizeDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  carerId?: string;
}

