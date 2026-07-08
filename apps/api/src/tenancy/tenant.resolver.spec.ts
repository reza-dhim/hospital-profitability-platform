import { ForbiddenException } from "@nestjs/common";
import { TenantResolver } from "./tenant.resolver";
import type { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "../auth/types/jwt-payload.type";

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: "user-1",
    org_id: "org-1",
    active_hospital_id: "hospital-active",
    role: "system_admin",
    permissions_hash: "hash",
    ...overrides,
  };
}

describe("TenantResolver", () => {
  it("resolves to the JWT's active hospital when no header is provided", async () => {
    const prisma = { userHospitalMembership: { findFirst: jest.fn() } } as unknown as PrismaService;
    const resolver = new TenantResolver(prisma);

    await expect(resolver.resolve(makeUser())).resolves.toEqual({
      organizationId: "org-1",
      hospitalId: "hospital-active",
      userId: "user-1",
    });
    expect(prisma.userHospitalMembership.findFirst).not.toHaveBeenCalled();
  });

  it("resolves without a DB lookup when the header matches the active hospital", async () => {
    const prisma = { userHospitalMembership: { findFirst: jest.fn() } } as unknown as PrismaService;
    const resolver = new TenantResolver(prisma);

    await expect(resolver.resolve(makeUser(), "hospital-active")).resolves.toEqual({
      organizationId: "org-1",
      hospitalId: "hospital-active",
      userId: "user-1",
    });
    expect(prisma.userHospitalMembership.findFirst).not.toHaveBeenCalled();
  });

  it("switches hospital context when a valid membership exists in the same organization", async () => {
    const prisma = {
      userHospitalMembership: {
        findFirst: jest.fn().mockResolvedValue({
          hospitalId: "hospital-other",
          hospital: { organizationId: "org-1", deletedAt: null },
        }),
      },
    } as unknown as PrismaService;
    const resolver = new TenantResolver(prisma);

    await expect(resolver.resolve(makeUser(), "hospital-other")).resolves.toEqual({
      organizationId: "org-1",
      hospitalId: "hospital-other",
      userId: "user-1",
    });
  });

  it("rejects a hospital header with no membership row (cross-tenant isolation)", async () => {
    const prisma = {
      userHospitalMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const resolver = new TenantResolver(prisma);

    await expect(resolver.resolve(makeUser(), "hospital-not-mine")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a membership that resolves to a hospital in a different organization", async () => {
    const prisma = {
      userHospitalMembership: {
        findFirst: jest.fn().mockResolvedValue({
          hospitalId: "hospital-other-org",
          hospital: { organizationId: "org-2", deletedAt: null },
        }),
      },
    } as unknown as PrismaService;
    const resolver = new TenantResolver(prisma);

    await expect(resolver.resolve(makeUser(), "hospital-other-org")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a membership pointing at a soft-deleted hospital", async () => {
    const prisma = {
      userHospitalMembership: {
        findFirst: jest.fn().mockResolvedValue({
          hospitalId: "hospital-deleted",
          hospital: { organizationId: "org-1", deletedAt: new Date() },
        }),
      },
    } as unknown as PrismaService;
    const resolver = new TenantResolver(prisma);

    await expect(resolver.resolve(makeUser(), "hospital-deleted")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
