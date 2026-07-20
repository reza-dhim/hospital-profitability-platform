import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentTenant } from "../tenancy/current-tenant.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { requireHospitalId } from "../common/tenant-scope.util";
import { ProfitabilityQueryService } from "./profitability-query.service";
import { ListProfitCentersQueryDto, ProfitabilityQueryDto, TrendsQueryDto } from "./dto/profitability-query.dto";
import { ProfitabilitySummaryResponseDto } from "./dto/profitability-summary-response.dto";
import { ProfitCenterProfitabilityResponseDto } from "./dto/profit-center-profitability-response.dto";
import { ServiceUnitCostResponseDto } from "./dto/service-unit-cost-response.dto";
import { ProfitabilityTrendResponseDto } from "./dto/profitability-trend-response.dto";

/**
 * docs/09_PROFITABILITY_ENGINE.md, docs/10_UNIT_COST_ENGINE.md — read-only,
 * reads exclusively from the materialized `profitability_results`/
 * `service_unit_costs` tables (never recomputes). Gated by
 * `profitability.read`.
 */
@ApiTags("profitability")
@ApiBearerAuth()
@Controller("profitability")
export class ProfitabilityController {
  constructor(private readonly profitabilityQueryService: ProfitabilityQueryService) {}

  @Get("summary")
  @RequirePermissions("profitability.read")
  @ApiOperation({ summary: "Hospital-wide profitability totals for the latest completed run of a period." })
  @ApiOkResponse({ type: ProfitabilitySummaryResponseDto })
  @ApiNotFoundResponse({ description: "No completed, non-stale allocation run exists for this period." })
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: ProfitabilityQueryDto) {
    return this.profitabilityQueryService.summary(requireHospitalId(tenant), query);
  }

  @Get("profit-centers")
  @RequirePermissions("profitability.read")
  @ApiOperation({ summary: "Per-profit-center profitability, ranked by margin or gross profit." })
  @ApiOkResponse({ type: ProfitCenterProfitabilityResponseDto })
  profitCenters(@CurrentTenant() tenant: TenantContext, @Query() query: ListProfitCentersQueryDto) {
    return this.profitabilityQueryService.profitCenters(requireHospitalId(tenant), query);
  }

  @Get("services")
  @RequirePermissions("profitability.read")
  @ApiOperation({ summary: "Per-service unit cost, tariff gap, and recommended tariff." })
  @ApiOkResponse({ type: ServiceUnitCostResponseDto })
  services(@CurrentTenant() tenant: TenantContext, @Query() query: ProfitabilityQueryDto) {
    return this.profitabilityQueryService.services(requireHospitalId(tenant), query);
  }

  @Get("trends")
  @RequirePermissions("profitability.read")
  @ApiOperation({ summary: "Period-over-period trend for one profit center, across its latest completed runs." })
  @ApiOkResponse({ type: ProfitabilityTrendResponseDto })
  @ApiNotFoundResponse({ description: "Profit center not found." })
  trends(@CurrentTenant() tenant: TenantContext, @Query() query: TrendsQueryDto) {
    return this.profitabilityQueryService.trends(requireHospitalId(tenant), query.profitCenterId);
  }
}
