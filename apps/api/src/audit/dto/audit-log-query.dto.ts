import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";

/** `GET /audit-logs` filters per docs/23_AUDIT_TRAIL.md §4 ("filterable by entity/user/date range"). */
export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Exact-match entity/table name, e.g. \"cost_center\"." })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: "Exact-match entity id." })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: "Exact-match acting user id. Ignored for a caller restricted to their own actions." })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "ISO 8601 — only entries at/after this instant." })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: "ISO 8601 — only entries at/before this instant." })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
