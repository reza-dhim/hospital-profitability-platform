import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { allocatedCost, Decimal, driverPercentage, margin } from "@hpp/domain";
import { PrismaService } from "../prisma/prisma.service";

export interface DoctorProfitabilityRow {
  allocationRunId: string;
  doctorId: string;
  serviceId: string;
  revenue: string;
  cost: string;
  profit: string;
  margin: string | null;
  avgDuration: string;
  avgBmhp: string;
}

/**
 * Sprint 8 (docs/11_DOCTOR_ANALYTICS.md §2) — grouped by (doctor, service):
 * `cost` is this doctor's own bmhp/room/staff cost for that service, PLUS
 * this doctor's volume-share of the service's already-computed
 * `serviceAllocatedCost` (from `ProfitabilityEngineService.
 * computeServiceUnitCostRows()`, passed in — never recomputed here, so the
 * profit-center-to-service apportionment happens exactly once). Called from
 * `ProfitabilityEngineService.run()` and written in the same transaction as
 * `ProfitabilityResult`/`ServiceUnitCost`, per docs/09_PROFITABILITY_ENGINE.md
 * §3's "next stage of the same pipeline". A doctor+service pair below the
 * `docs/11_DOCTOR_ANALYTICS.md` §3 minimum sample size (5 cases) still gets
 * a row here — only the `/comparison` read API excludes it from cohort math.
 */
@Injectable()
export class DoctorProfitabilityEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async computeRows(
    hospitalId: string,
    allocationRunId: string,
    periodId: string,
    serviceAllocatedCostByServiceId: Map<string, Prisma.Decimal>
  ): Promise<DoctorProfitabilityRow[]> {
    const byDoctorService = await this.prisma.medicalActivity.groupBy({
      by: ["doctorId", "serviceId"],
      where: { hospitalId, periodId },
      _sum: { revenue: true, bmhpCost: true, roomCost: true, staffCost: true, volume: true },
      _avg: { durationMinutes: true, bmhpCost: true },
    });
    if (byDoctorService.length === 0) return [];

    // Service-level totals derived from the same result set (not a second
    // query) — sum of every doctor's volume for that service, and how many
    // distinct doctors performed it (for the equal-split fallback below).
    const serviceTotalVolumeByServiceId = new Map<string, Prisma.Decimal>();
    const doctorCountByServiceId = new Map<string, number>();
    for (const group of byDoctorService) {
      const volume = new Prisma.Decimal(group._sum.volume ?? 0);
      serviceTotalVolumeByServiceId.set(
        group.serviceId,
        (serviceTotalVolumeByServiceId.get(group.serviceId) ?? new Prisma.Decimal(0)).plus(volume)
      );
      doctorCountByServiceId.set(group.serviceId, (doctorCountByServiceId.get(group.serviceId) ?? 0) + 1);
    }

    return byDoctorService.map((group): DoctorProfitabilityRow => {
      const ownCost = new Prisma.Decimal(group._sum.bmhpCost ?? 0)
        .plus(new Prisma.Decimal(group._sum.roomCost ?? 0))
        .plus(new Prisma.Decimal(group._sum.staffCost ?? 0));

      const serviceAllocated = serviceAllocatedCostByServiceId.get(group.serviceId) ?? new Prisma.Decimal(0);
      const serviceTotalVolume = serviceTotalVolumeByServiceId.get(group.serviceId) ?? new Prisma.Decimal(0);
      const doctorVolume = new Prisma.Decimal(group._sum.volume ?? 0);
      const doctorCount = doctorCountByServiceId.get(group.serviceId) ?? 1;
      // Zero-volume-denominator fallback: same "equal-split, never silent"
      // convention as the allocation engine's W_DRIVER_ZERO and
      // computeServiceUnitCostRows()'s own zero-revenue fallback.
      const volumeShare = driverPercentage(doctorVolume, serviceTotalVolume) ?? new Decimal(1).dividedBy(doctorCount);
      const apportionedAllocatedCost = allocatedCost(serviceAllocated, volumeShare);

      const cost = ownCost.plus(apportionedAllocatedCost);
      const revenue = new Prisma.Decimal(group._sum.revenue ?? 0);
      const profit = revenue.minus(cost);
      const m = margin(profit, revenue);

      return {
        allocationRunId,
        doctorId: group.doctorId,
        serviceId: group.serviceId,
        revenue: revenue.toFixed(2),
        cost: cost.toFixed(2),
        profit: profit.toFixed(2),
        margin: m ? m.toFixed(4) : null,
        avgDuration: new Prisma.Decimal(group._avg.durationMinutes ?? 0).toFixed(2),
        avgBmhp: new Prisma.Decimal(group._avg.bmhpCost ?? 0).toFixed(2),
      };
    });
  }
}
