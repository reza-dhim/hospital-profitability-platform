import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AuditLogResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() hospitalId?: string | null;
  @ApiPropertyOptional() userId?: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entity!: string;
  @ApiPropertyOptional() entityId?: string | null;
  @ApiPropertyOptional({ type: "object", additionalProperties: true }) beforeJson?: unknown;
  @ApiPropertyOptional({ type: "object", additionalProperties: true }) afterJson?: unknown;
  @ApiPropertyOptional() ipAddress?: string | null;
  @ApiProperty() createdAt!: Date;
}
