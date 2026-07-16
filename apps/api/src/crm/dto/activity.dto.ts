import { IsString, IsOptional, IsEnum, IsUUID } from "class-validator";
import { CrmActivityType } from "@prisma/client";

export class CreateActivityDto {
  @IsOptional() @IsEnum(CrmActivityType) type?: CrmActivityType;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  /** TASK owner — org member user id; defaults to the creator when omitted. */
  @IsOptional() @IsUUID() assignedToId?: string;
}

// Send a real Email / SMS / Push to a CRM entity and log it on the timeline.
export class SendMessageDto {
  @IsEnum(["email", "sms", "push"]) channel!: "email" | "sms" | "push";
  @IsOptional() @IsString() subject?: string;
  @IsString() body!: string;
}
