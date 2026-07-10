import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDriverDto {
  @ApiProperty({ example: "DRV-001" })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: "Employee Count" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: "person", description: "Unit the driver value is measured in (e.g. person, m2, device)." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  unit!: string;

  @ApiPropertyOptional({ example: "Headcount per cost center, used to allocate HR overhead." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
