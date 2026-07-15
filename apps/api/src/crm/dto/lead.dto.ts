import { IsString, IsOptional, IsEnum, IsUUID, IsInt, IsDateString } from "class-validator";
import { Type } from "class-transformer";
import { AccountType, LeadStatus, OpportunityStage } from "@prisma/client";

// Public website intake (multipart; photos arrive as files, not in the body).
export class CreateLeadPublicDto {
  @IsString() name!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() source?: string; // website:quote | website:assessment | website:contact
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() poolSize?: string;
  @IsOptional() @IsString() chemicals?: string;
  @IsOptional() @IsString() address?: string;
}

// Admin manual lead creation.
export class CreateLeadDto {
  @IsString() name!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() leadType?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsDateString() followUpDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() poolSize?: string;
  @IsOptional() @IsString() chemicals?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() leadType?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsDateString() followUpDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() poolSize?: string;
  @IsOptional() @IsString() chemicals?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}

// Send a real Email / SMS / Push to the lead and log it on the timeline.
export class SendLeadMessageDto {
  @IsEnum(["email", "sms", "push"]) channel!: "email" | "sms" | "push";
  @IsOptional() @IsString() subject?: string; // email subject / push title
  @IsString() body!: string;
}

// Convert a Lead into an Account (+ primary Contact) and an Opportunity.
export class ConvertLeadDto {
  // Link to an existing Account, or omit to create a new one from the lead.
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsEnum(AccountType) accountType?: AccountType;
  @IsOptional() @IsString() opportunityName?: string;
  @IsOptional() @IsEnum(OpportunityStage) stage?: OpportunityStage;
  @IsOptional() @IsInt() @Type(() => Number) valueCents?: number;
  // When set, also schedule an on-site assessment meeting on the new opportunity.
  @IsOptional() @IsDateString() assessmentDate?: string;
  @IsOptional() @IsString() assessmentNotes?: string;
}

// Book an on-site assessment: converts the lead and schedules the assessment.
export class BookAssessmentDto {
  @IsDateString() assessmentDate!: string;
  @IsOptional() @IsString() assessmentNotes?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsEnum(AccountType) accountType?: AccountType;
  @IsOptional() @IsString() opportunityName?: string;
  @IsOptional() @IsInt() @Type(() => Number) valueCents?: number;
  // Team member assigned to perform the assessment; gets an emailed form link.
  @IsOptional() @IsUUID() assigneeId?: string;
}
