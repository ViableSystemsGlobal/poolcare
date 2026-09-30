import { IsEnum, IsObject, IsOptional, IsString } from "class-validator";

export class FailJobDto {
  @IsEnum(["NO_ACCESS", "CLIENT_ABSENT", "EQUIP_FAILURE", "OTHER"])
  code: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Evidence for access failures (contract cl. 13.3): where the carer was and a photo.
  @IsOptional()
  @IsObject()
  location?: { lat: number; lng: number; accuracyM?: number };

  @IsOptional()
  @IsString()
  photoUrl?: string; // from POST /jobs/:id/access-photo
}
