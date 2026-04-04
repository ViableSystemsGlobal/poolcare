import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class DispatchOptimizeDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsUUID()
  carerId?: string;
}

