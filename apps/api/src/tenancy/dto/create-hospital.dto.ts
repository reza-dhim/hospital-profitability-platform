import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateHospitalDto {
  @ApiProperty({ example: "Rumah Sakit Contoh Dua" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "RSCD" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional({ example: "Jl. Contoh No. 2, Jakarta" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}
