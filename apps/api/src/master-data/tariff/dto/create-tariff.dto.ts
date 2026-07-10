import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsISO8601, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateTariffDto {
  @ApiProperty({ description: "Service this tariff applies to." })
  @IsString()
  serviceId!: string;

  @ApiProperty({ example: 150000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentTariff!: number;

  @ApiPropertyOptional({ example: 175000, description: "AI/analyst-recommended tariff, if any." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedTariff?: number;

  @ApiProperty({ example: "2026-08-01" })
  @IsISO8601()
  effectiveDate!: string;
}
