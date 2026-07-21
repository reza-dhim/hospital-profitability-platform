import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

/**
 * docs/11_DOCTOR_ANALYTICS.md: reads scope to the latest completed,
 * non-stale run for `periodId` unless `allocationRunId` is explicitly
 * supplied — same contract as `ProfitabilityQueryDto`.
 */
export class DoctorAnalyticsQueryDto {
  @ApiProperty()
  @IsUUID()
  periodId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  allocationRunId?: string;
}

/**
 * `doctorId` is only meaningful for a caller holding `doctor_analytics.
 * read_detail` — a caller without it always gets the de-identified shape
 * regardless of whether `doctorId` was supplied (docs/04_RBAC.md §5: the
 * masking decision is server-side, never a client-trusted parameter).
 */
export class DoctorComparisonQueryDto extends DoctorAnalyticsQueryDto {
  @ApiPropertyOptional({ description: "Only honored for callers with doctor_analytics.read_detail." })
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}
