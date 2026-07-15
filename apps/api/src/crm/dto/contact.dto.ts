import { IsString, IsOptional, IsUUID, IsBoolean } from "class-validator";

export class CreateContactDto {
  @IsUUID() accountId!: string;
  @IsString() firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateContactDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}
