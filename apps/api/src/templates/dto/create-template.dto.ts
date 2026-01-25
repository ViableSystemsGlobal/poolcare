import { IsString, IsArray, IsObject, IsOptional, IsInt, Min } from "class-validator";

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsArray()
  checklist: any[]; // Array of {id, label, required?, photoRequired?}

  @IsOptional()
  @IsObject()
  targets?: any; // {ph: [min, max], chlorine_free: [min, max], ...}

  @IsOptional()
  @IsInt()
  @Min(10)
  serviceDurationMin?: number;
}

