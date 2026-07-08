import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import type { TenantContext } from "./tenant-context";

function forbiddenHospital(): ForbiddenException {
  return new ForbiddenException({
    code: "TENANT_HOSPITAL_FORBIDDEN",
    message: "You do not have access to the requested hospital.",
  });
}

/**
 * Computes the effective `TenantContext` for a request: the user's org (from
 * the JWT, trusted — set at login) plus the effective hospital, which is
 * either the `X-Hospital-Id` header (validated against
 * `user_hospital_memberships`, docs/03_MULTI_TENANT.md §4) or, absent a
 * header, the JWT's `active_hospital_id` (already validated at
 * login/refresh time by Sprint 2.1's `AuthService`).
 */
@Injectable()
export class TenantResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: JwtPayload, requestedHospitalId?: string): Promise<TenantContext> {
    if (!requestedHospitalId || requestedHospitalId === user.active_hospital_id) {
      return { organizationId: user.org_id, hospitalId: user.active_hospital_id, userId: user.sub };
    }

    const membership = await this.prisma.userHospitalMembership.findFirst({
      where: { userId: user.sub, hospitalId: requestedHospitalId, deletedAt: null },
      include: { hospital: true },
    });

    if (!membership || membership.hospital.organizationId !== user.org_id || membership.hospital.deletedAt) {
      throw forbiddenHospital();
    }

    return { organizationId: user.org_id, hospitalId: membership.hospitalId, userId: user.sub };
  }
}
