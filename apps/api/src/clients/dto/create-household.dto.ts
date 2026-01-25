import { IsString, IsOptional, IsUUID } from "class-validator";

export class CreateHouseholdDto {
  @IsString()
  name: string; // e.g., "The Smith Family"
}
