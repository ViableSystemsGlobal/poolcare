import { IsString, IsOptional, IsArray, IsObject } from "class-validator";

export class SendMessageDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  attachments?: any[];

  @IsOptional()
  @IsObject()
  meta?: any;
}

