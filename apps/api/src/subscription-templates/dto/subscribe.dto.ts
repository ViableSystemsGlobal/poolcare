import { IsIn, IsInt, IsString, IsOptional, IsDateString, IsBoolean } from "class-validator";

export class SubscribeToTemplateDto {
  @IsString()
  poolId: string;

  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsString()
  preferredCarerId?: string;

  // Prepaid term length in months (1, 3, 6 or 12 — whichever Settings offers).
  @IsOptional()
  @IsInt()
  @IsIn([1, 3, 6, 12])
  termMonths?: number;
}
