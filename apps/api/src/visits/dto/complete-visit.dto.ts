import { IsOptional, IsString, IsInt, Min, Max, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ChecklistItemDto {
  @IsString()
  id: string;

  @IsString()
  task: string;

  @IsOptional()
  completed?: boolean;

  @IsOptional()
  required?: boolean;

  @IsOptional()
  notApplicable?: boolean;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  value?: number | string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

