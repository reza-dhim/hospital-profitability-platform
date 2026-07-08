import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class HospitalResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional() address?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
