import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class BusinessPartnerChatMessageDto {
  @IsEnum(["user", "assistant", "system"])
  role: "user" | "assistant" | "system";

  @IsString()
  content: string;
}

export class BusinessPartnerChatDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessPartnerChatMessageDto)
  messages: BusinessPartnerChatMessageDto[];
}
