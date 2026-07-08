import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateOrganizationDto {
  @ApiProperty({ example: "Contoh Group" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;
}
