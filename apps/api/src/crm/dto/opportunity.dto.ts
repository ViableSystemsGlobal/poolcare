import { IsString, IsOptional, IsEnum, IsUUID, IsInt, IsNumber, IsArray, IsIn, IsDateString } from "class-validator";
import { Type } from "class-transformer";
import { OpportunityStage } from "@prisma/client";

// On-site assessment report for an opportunity (upsert).
export class UpsertAssessmentDto {
  @IsOptional() @IsIn(["PENDING", "COMPLETED"]) status?: string;
  @IsOptional() @IsDateString() assessedAt?: string;

  @IsOptional() @IsString() poolType?: string;
  @IsOptional() @IsString() surfaceType?: string;
  @IsOptional() @IsString() filtrationType?: string;
  @IsOptional() @IsInt() @Type(() => Number) volumeL?: number;
  @IsOptional() @IsString() dimensions?: string;

  @IsOptional() @IsNumber() @Type(() => Number) ph?: number;
  @IsOptional() @IsNumber() @Type(() => Number) chlorineFree?: number;
  @IsOptional() @IsInt() @Type(() => Number) alkalinity?: number;
  @IsOptional() @IsInt() @Type(() => Number) calciumHardness?: number;
  @IsOptional() @IsInt() @Type(() => Number) cyanuricAcid?: number;
  @IsOptional() @IsNumber() @Type(() => Number) salinity?: number;

  @IsOptional() @IsInt() @Type(() => Number) conditionRating?: number;
  @IsOptional() @IsString() equipmentNotes?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() recommendation?: string;
  @IsOptional() @IsString() recommendedPlan?: string;
  @IsOptional() @IsInt() @Type(() => Number) estimatedCostCents?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];

  // When true, copy estimatedCostCents onto the opportunity's deal value.
  @IsOptional() applyToDealValue?: boolean;
}

// Assign a team member to perform the on-site assessment; they get an emailed
// secure link to the field form (CRM Phase 2).
export class DispatchAssessmentDto {
  @IsUUID() assigneeId!: string;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsString() note?: string;
}

// Public submission of the assessment form (no auth — gated by the form token).
export class SubmitAssessmentFormDto {
  @IsOptional() @IsString() poolType?: string;
  @IsOptional() @IsString() surfaceType?: string;
  @IsOptional() @IsString() filtrationType?: string;
  @IsOptional() @IsInt() @Type(() => Number) volumeL?: number;
  @IsOptional() @IsString() dimensions?: string;
  @IsOptional() @IsNumber() @Type(() => Number) ph?: number;
  @IsOptional() @IsNumber() @Type(() => Number) chlorineFree?: number;
  @IsOptional() @IsInt() @Type(() => Number) alkalinity?: number;
  @IsOptional() @IsInt() @Type(() => Number) calciumHardness?: number;
  @IsOptional() @IsInt() @Type(() => Number) cyanuricAcid?: number;
  @IsOptional() @IsNumber() @Type(() => Number) salinity?: number;
  @IsOptional() @IsInt() @Type(() => Number) conditionRating?: number;
  @IsOptional() @IsString() equipmentNotes?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() recommendation?: string;
  @IsOptional() @IsString() recommendedPlan?: string;
  @IsOptional() @IsInt() @Type(() => Number) estimatedCostCents?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
}

export class CreateOpportunityDto {
  @IsUUID() accountId!: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsString() name!: string;
  @IsOptional() @IsEnum(OpportunityStage) stage?: OpportunityStage;
  @IsOptional() @IsInt() @Type(() => Number) valueCents?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Type(() => Number) probability?: number;
  @IsOptional() @IsString() expectedCloseDate?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}

export class UpdateOpportunityDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(OpportunityStage) stage?: OpportunityStage;
  @IsOptional() @IsInt() @Type(() => Number) valueCents?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Type(() => Number) probability?: number;
  @IsOptional() @IsString() expectedCloseDate?: string;
  @IsOptional() @IsString() lostReason?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}
