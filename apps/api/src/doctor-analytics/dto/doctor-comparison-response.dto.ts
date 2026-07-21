import { ApiProperty } from "@nestjs/swagger";
import { CohortDistributionDto } from "./cohort-distribution.dto";

/**
 * docs/11_DOCTOR_ANALYTICS.md §4's per-factor attribution — always present
 * alongside a variance figure, per `01_BUSINESS_RULES.md` §7 ("a bare
 * cost-variance number without context is not permitted anywhere in the
 * UI"). Present even when `sufficientSample` is false on the parent
 * response, so the UI can still show context, never a bare "insufficient
 * data" with nothing else.
 */
export class ComparisonFactorDto {
  @ApiProperty({ enum: ["bmhp_cost", "duration_minutes", "room_cost", "staff_cost"] })
  factor!: string;
  @ApiProperty({ type: String, nullable: true }) doctorAvg!: string | null;
  @ApiProperty({ type: String, nullable: true }) cohortMedian!: string | null;
  @ApiProperty({ type: String, nullable: true }) delta!: string | null;
}

const PERCENTILE_BAND_VALUES = ["below_p25", "p25_p75", "p75_p90", "above_p90"] as const;

/**
 * Doctor-identified shape — only returned when the caller holds
 * `doctor_analytics.read_detail` AND supplied `doctorId` (docs/04_RBAC.md
 * §5). `percentileBand` is null and `insufficientDataReason` is set when
 * `sufficientSample` is false (docs §3's <5-case minimum) — the row still
 * exists in `doctor_profitability_results` and `factors` is still
 * populated, only the cohort-comparison figure is withheld.
 */
export class DoctorComparisonIdentifiedResponseDto {
  @ApiProperty() serviceId!: string;
  @ApiProperty() serviceCode!: string;
  @ApiProperty() serviceName!: string;
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty() doctorId!: string;
  @ApiProperty() doctorCode!: string;
  @ApiProperty() doctorName!: string;
  @ApiProperty() caseCount!: number;
  @ApiProperty() sufficientSample!: boolean;
  @ApiProperty({ type: String, nullable: true }) unitCostEquivalent!: string | null;
  @ApiProperty({ type: CohortDistributionDto }) cohort!: CohortDistributionDto;
  @ApiProperty({ enum: PERCENTILE_BAND_VALUES, nullable: true }) percentileBand!: string | null;
  @ApiProperty({ type: String, nullable: true, description: "(doctor's unit-cost-equivalent - cohort median) x doctor's volume." })
  totalCostDelta!: string | null;
  @ApiProperty({ type: [ComparisonFactorDto] }) factors!: ComparisonFactorDto[];
  @ApiProperty({ type: String, nullable: true }) insufficientDataReason!: string | null;
}

export class DoctorComparisonBandCountDto {
  @ApiProperty({ enum: PERCENTILE_BAND_VALUES }) band!: string;
  @ApiProperty() doctorCount!: number;
}

/**
 * De-identified shape — returned when the caller lacks `doctor_analytics.
 * read_detail`, or has it but omitted `doctorId`. No `doctorId`/`doctorName`
 * or any individual doctor's figures anywhere in this payload — enforced
 * server-side, matching docs/04_RBAC.md §5's example phrasing ("3 doctors
 * above the 90th percentile for this procedure").
 */
export class DoctorComparisonAggregateResponseDto {
  @ApiProperty() serviceId!: string;
  @ApiProperty() serviceCode!: string;
  @ApiProperty() serviceName!: string;
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty({ type: CohortDistributionDto }) cohort!: CohortDistributionDto;
  @ApiProperty({ type: [DoctorComparisonBandCountDto] }) bands!: DoctorComparisonBandCountDto[];
  @ApiProperty() insufficientDataDoctorCount!: number;
}
