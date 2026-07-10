import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../auth/decorators/permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { JwtPayload } from "../../auth/types/jwt-payload.type";
import { CurrentTenant } from "../../tenancy/current-tenant.decorator";
import type { TenantContext } from "../../tenancy/tenant-context";
import { requireHospitalId } from "../../common/tenant-scope.util";
import { HospitalSettingsService } from "./hospital-settings.service";
import { UpdateHospitalSettingsDto } from "./dto/update-hospital-settings.dto";
import { HospitalSettingsResponseDto } from "./dto/hospital-settings-response.dto";

/** docs/24_CONFIGURATION.md — gated by `hospital.*` since it's hospital administration, per §2 ("System Admin manages all settings"). */
@ApiTags("hospital-settings")
@ApiBearerAuth()
@Controller("hospital-settings")
export class HospitalSettingsController {
  constructor(private readonly hospitalSettingsService: HospitalSettingsService) {}

  @Get()
  @RequirePermissions("hospital.read")
  @ApiOperation({ summary: "Get the caller's hospital configuration (created with defaults on first access)." })
  @ApiOkResponse({ type: HospitalSettingsResponseDto })
  get(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.hospitalSettingsService.getOrCreate(requireHospitalId(tenant), user.sub);
  }

  @Patch()
  @RequirePermissions("hospital.write")
  @ApiOperation({ summary: "Update the caller's hospital configuration." })
  @ApiOkResponse({ type: HospitalSettingsResponseDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateHospitalSettingsDto
  ) {
    return this.hospitalSettingsService.update(requireHospitalId(tenant), dto, user.sub);
  }
}
