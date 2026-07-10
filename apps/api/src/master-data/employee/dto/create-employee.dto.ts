import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MasterDataStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateEmployeeDto {
  @ApiProperty({ example: "EMP-001" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "Siti Rahma" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: "Staff Administrasi" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  roleTitle?: string;

  @ApiPropertyOptional({ description: "Cost center this employee's cost is attributed to." })
  @IsOptional()
  @IsString()
  departmentCostCenterId?: string;

  @ApiProperty({ example: "permanent", description: "Free-form employment type (e.g. permanent, contract, part-time)." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  employmentType!: string;

  @ApiPropertyOptional({ enum: MasterDataStatus, default: MasterDataStatus.active })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}
