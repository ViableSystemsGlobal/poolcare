import { IsString, IsEnum } from "class-validator";

export class LinkThreadDto {
  @IsEnum(["pool", "job", "visit", "invoice", "quote", "service_plan"])
  targetType: string;

  @IsString()
  targetId: string;
}

