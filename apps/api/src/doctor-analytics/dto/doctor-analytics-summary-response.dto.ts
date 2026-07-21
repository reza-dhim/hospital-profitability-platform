import { ApiProperty } from "@nestjs/swagger";
import { CohortDistributionDto } from "./cohort-distribution.dto";

/**
 * Service-grain, always de-identified (docs/04_RBAC.md §5's masking never
 * applies here — no field ever names a doctor) — same response for every
 * caller holding `doctor_analytics.read`, no `read_detail` branch needed.
 */
export class DoctorAnalyticsSummaryRowDto {
  @ApiProperty() serviceId!: string;
  @ApiProperty() serviceCode!: string;
  @ApiProperty() serviceName!: string;
  @ApiProperty() doctorCount!: number;
  @ApiProperty() totalRevenue!: string;
  @ApiProperty() totalCost!: string;
  @ApiProperty() totalProfit!: string;
  @ApiProperty({ type: String, nullable: true }) overallMargin!: string | null;
  @ApiProperty({ type: CohortDistributionDto, nullable: true, description: "Null when no doctor has volume data for this service this period." })
  cohort!: CohortDistributionDto | null;
  @ApiProperty() doctorsAboveP90Count!: number;
  @ApiProperty() doctorsBelowP25Count!: number;
  @ApiProperty({ description: "Doctor+service pairs with fewer than 5 cases this period (docs/11_DOCTOR_ANALYTICS.md §3) — excluded from the comparison endpoint's variance math." })
  insufficientSampleDoctorCount!: number;
}

export class DoctorAnalyticsSummaryResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty({ type: [DoctorAnalyticsSummaryRowDto] })
  data!: DoctorAnalyticsSummaryRowDto[];
}
