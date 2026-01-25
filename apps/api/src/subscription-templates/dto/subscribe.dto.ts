import { IsString, IsOptional, IsDateString, IsBoolean } from "class-validator";

export class SubscribeToTemplateDto {
  @IsString()
  poolId: string;

  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
