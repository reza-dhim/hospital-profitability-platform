import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiExtraModels, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, getSchemaPath } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { DoctorAnalyticsService } from "./doctor-analytics.service";
import { DoctorAnalyticsQueryDto, DoctorComparisonQueryDto } from "./dto/doctor-analytics-query.dto";
import { DoctorAnalyticsSummaryResponseDto } from "./dto/doctor-analytics-summary-response.dto";
import { DoctorComparisonAggregateResponseDto, DoctorComparisonIdentifiedResponseDto } from "./dto/doctor-comparison-response.dto";

/**
 * docs/11_DOCTOR_ANALYTICS.md — read-only, reads exclusively from the
 * materialized `doctor_profitability_results`/`medical_activities` tables
 * (never recomputes). Every route requires only the baseline
 * `doctor_analytics.read` (every `read_detail`-holding role also holds
 * `read`, confirmed in `default-role-permissions.ts`) — the detail-vs-
 * aggregate masking decision happens inside `DoctorAnalyticsService`, not
 * here, since it depends on the caller's permission set, not just whether
 * they're authenticated.
 */
@ApiTags("doctor-analytics")
@ApiBearerAuth()
@ApiExtraModels(DoctorComparisonIdentifiedResponseDto, DoctorComparisonAggregateResponseDto)
@Controller("doctor-analytics")
export class DoctorAnalyticsController {
  constructor(private readonly doctorAnalyticsService: DoctorAnalyticsService) {}

  @Get("summary")
  @RequirePermissions("doctor_analytics.read")
  @ApiOperation({ summary: "Per-service doctor-performance summary for the latest completed run of a period — always de-identified." })
  @ApiOkResponse({ type: DoctorAnalyticsSummaryResponseDto })
  @ApiNotFoundResponse({ description: "No completed, non-stale allocation run exists for this period." })
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: DoctorAnalyticsQueryDto) {
    return this.doctorAnalyticsService.summary(requireHospitalId(tenant), query);
  }

  @Get("services/:serviceId/comparison")
  @RequirePermissions("doctor_analytics.read")
  @ApiOperation({
    summary:
      "Cross-doctor variance comparison for one service. Returns a doctor-identified shape (with contributing factors) " +
      "only when the caller holds doctor_analytics.read_detail and supplied doctorId; otherwise a de-identified " +
      "percentile-band breakdown (docs/04_RBAC.md §5).",
  })
  @ApiOkResponse({
    schema: { oneOf: [{ $ref: getSchemaPath(DoctorComparisonIdentifiedResponseDto) }, { $ref: getSchemaPath(DoctorComparisonAggregateResponseDto) }] },
    description: "Identified shape for read_detail callers with doctorId supplied; de-identified shape otherwise — see docs/11_DOCTOR_ANALYTICS.md §5.",
  })
  @ApiNotFoundResponse({ description: "Service or allocation run not found." })
  comparison(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("serviceId") serviceId: string,
    @Query() query: DoctorComparisonQueryDto
  ) {
    return this.doctorAnalyticsService.comparison(requireHospitalId(tenant), serviceId, query, user.role);
  }
}
