import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: [String] }) permissionCodes!: string[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
