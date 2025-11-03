import { IsString, IsObject, IsOptional, IsInt, Min } from "class-validator";

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  checklist?: any;

  @IsOptional()
  @IsObject()
  targets?: any;

  @IsOptional()
  @IsInt()
  @Min(10)
  serviceDurationMin?: number;
}

