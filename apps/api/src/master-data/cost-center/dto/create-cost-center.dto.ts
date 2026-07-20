import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CostCenterType, MasterDataStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

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

  @ApiProperty({
    enum: CostCenterType,
    example: CostCenterType.indirect,
    description: "'direct' = directly incurred by one profit center (requires profitCenterId). 'indirect' flows only through the allocation graph.",
  })
  @IsEnum(CostCenterType)
  type!: CostCenterType;

  @ApiPropertyOptional({ description: "Required when type = 'direct'; must be omitted when type = 'indirect'." })
  @ValidateIf((dto: CreateCostCenterDto) => dto.type === CostCenterType.direct)
  @IsString()
  profitCenterId?: string;

  @ApiPropertyOptional({ enum: MasterDataStatus, default: MasterDataStatus.active })
  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}
