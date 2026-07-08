import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateBranchDto {
  @ApiProperty({ example: "Cabang Selatan" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "SEL" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;
}
