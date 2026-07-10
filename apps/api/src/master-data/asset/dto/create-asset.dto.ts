import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";
import { Type } from "class-transformer";

export class CreateAssetDto {
  @ApiProperty({ example: "AST-001" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "USG Machine GE Voluson" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "medical-equipment" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  category!: string;

  @ApiPropertyOptional({ description: "Cost center this asset's depreciation is attributed to." })
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiProperty({ example: 250000000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acquisitionCost!: number;

  @ApiProperty({ example: "straight-line", description: "Free-form depreciation method." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  depreciationMethod!: string;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usefulLifeMonths!: number;

  @ApiPropertyOptional({ enum: MasterDataStatus, default: MasterDataStatus.active })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}
