import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateRoleDto {
  @ApiProperty({ example: "billing_clerk" })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: "name must be lowercase snake_case (e.g. billing_clerk)",
  })
  name!: string;

  @ApiPropertyOptional({ example: "Handles patient billing inquiries." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: "Permission codes to grant on creation." })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes?: string[];
}
