import { IsString, IsOptional, IsInt } from "class-validator";

export class AssignJobDto {
  @IsString()
  carerId: string;

  @IsOptional()
  @IsInt()
  sequence?: number;
}

