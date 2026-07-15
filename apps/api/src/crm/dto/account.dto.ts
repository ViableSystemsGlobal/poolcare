import { IsString, IsOptional, IsEnum, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { AccountType } from "@prisma/client";

export class PrimaryContactDto {
  @IsString() firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() position?: string;
}

export class CreateAccountDto {
  @IsString() name!: string;
  @IsOptional() @IsEnum(AccountType) type?: AccountType;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @ValidateNested() @Type(() => PrimaryContactDto) primaryContact?: PrimaryContactDto;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(AccountType) type?: AccountType;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}
