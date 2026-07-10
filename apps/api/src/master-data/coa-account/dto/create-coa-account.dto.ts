import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateCoaAccountDto {
  @ApiProperty({ example: "5100" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "Biaya Gaji Karyawan" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "expense", description: "Free-form account category (e.g. expense, asset, revenue)." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  category!: string;
}
