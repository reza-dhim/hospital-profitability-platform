import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCostCenterDto {
  @ApiProperty({ example: "CC-001" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "Human Resources" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "support", description: "Free-form cost center type (e.g. support, revenue-generating)." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  type!: string;

  @ApiPropertyOptional({ enum: MasterDataStatus, default: MasterDataStatus.active })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}
