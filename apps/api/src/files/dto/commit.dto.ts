import { IsString } from "class-validator";

export class CommitDto {
  @IsString()
  key: string;

  @IsString()
  scope: string;

  @IsString()
  refId: string;
}

