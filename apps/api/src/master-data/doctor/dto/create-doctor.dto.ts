import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDoctorDto {
  @ApiProperty({ example: "DOC-001" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "dr. Ahmad Fauzi, Sp.PD" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: "Penyakit Dalam" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  specialty?: string;

  @ApiPropertyOptional({ enum: MasterDataStatus, default: MasterDataStatus.active })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}
