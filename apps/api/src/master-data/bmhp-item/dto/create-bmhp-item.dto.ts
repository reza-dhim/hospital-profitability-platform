import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";

export class CreateBmhpItemDto {
  @ApiProperty({ example: "BMHP-001" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "Sarung Tangan Steril" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "box", description: "Unit of measure (e.g. box, pcs, ml)." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  unit!: string;

  @ApiProperty({ example: 45000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardCost!: number;

  @ApiPropertyOptional({ description: "Vendor this item is standardly sourced from." })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({ enum: MasterDataStatus, default: MasterDataStatus.active })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}
