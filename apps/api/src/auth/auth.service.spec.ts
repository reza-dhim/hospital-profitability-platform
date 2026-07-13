import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TenantContextService } from "../tenancy/tenant-context.service";
import type { PasswordService } from "./password.service";
import type { TokenService } from "./token.service";
import type { PermissionsService } from "./permissions.service";

function makeDeps() {
  const prisma = {
    user: { findUnique: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const tenantContextService = {
    setAuthBypass: jest.fn(),
  } as unknown as TenantContextService;

  const passwordService = { verify: jest.fn() } as unknown as PasswordService;

  const tokenService = {
    signAccessToken: jest.fn().mockReturnValue("signed.access.token"),
    generateRefreshToken: jest.fn().mockReturnValue({
      token: "raw-refresh-token",
      tokenHash: "hashed-refresh-token",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    }),
    hashRefreshToken: jest.fn((token: string) => `hashed:${token}`),
  } as unknown as TokenService;

  const permissionsService = {
    getPermissionCodes: jest.fn().mockResolvedValue(["rbac.read"]),
    getPermissionCodesForRoleName: jest.fn(),
    hashPermissions: jest.fn().mockReturnValue("permissions-hash"),
  } as unknown as PermissionsService;

  return { prisma, tenantContextService, passwordService, tokenService, permissionsService };
}

const baseUser = {
  id: "user-1",
  organizationId: "org-1",
  hospitalId: "hospital-1",
  roleId: "role-1",
  role: { id: "role-1", name: "system_admin" },
  email: "admin@example.com",
  passwordHash: "hashed-password",
  status: "active",
  deletedAt: null,
};

describe("AuthService.login", () => {
  it("issues tokens and persists a refresh token for valid credentials", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (passwordService.verify as jest.Mock).mockResolvedValue(true);

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    const result = await service.login("admin@example.com", "correct-password", {});

    expect(result.accessToken).toBe("signed.access.token");
    expect(result.refreshToken).toBe("raw-refresh-token");
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", tokenHash: "hashed-refresh-token" }),
      })
    );
  });

  it("throws generic invalid-credentials for an unknown email", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.login("ghost@example.com", "whatever", {})).rejects.toThrow(UnauthorizedException);
  });

  it("throws generic invalid-credentials for a wrong password", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (passwordService.verify as jest.Mock).mockResolvedValue(false);

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.login("admin@example.com", "wrong", {})).rejects.toThrow(UnauthorizedException);
  });

  it("throws generic invalid-credentials for a non-active account without checking the password", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, status: "suspended" });

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.login("admin@example.com", "correct-password", {})).rejects.toThrow(
      UnauthorizedException
    );
    expect(passwordService.verify).not.toHaveBeenCalled();
  });
});

describe("AuthService.refresh", () => {
  const refreshRow = {
    id: "rt-1",
    userId: "user-1",
    tokenHash: "hashed:raw-token",
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  };

  it("rotates a valid refresh token and issues new tokens", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(refreshRow);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    const result = await service.refresh("raw-token", {});

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt-1" },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(result.accessToken).toBe("signed.access.token");
  });

  it("rejects an unknown token", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.refresh("raw-token", {})).rejects.toThrow(UnauthorizedException);
  });

  it("treats a reused (already-revoked) token as replay and revokes all of the user's active tokens", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({ ...refreshRow, revokedAt: new Date() });

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.refresh("raw-token", {})).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("rejects an expired token", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      ...refreshRow,
      expiresAt: new Date(Date.now() - 1000),
    });

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.refresh("raw-token", {})).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when the owning user is no longer active", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(refreshRow);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, status: "suspended" });

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.refresh("raw-token", {})).rejects.toThrow(UnauthorizedException);
  });
});

describe("AuthService.logout", () => {
  it("revokes a matching, non-revoked refresh token", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({ id: "rt-1", revokedAt: null });

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await service.logout("raw-token");

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does nothing when no token is provided", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await service.logout(undefined);
    expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });
});

describe("AuthService.getCurrentUser", () => {
  it("returns the mapped current-user DTO with resolved permissions", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      organization: { id: "org-1", name: "Contoh Group" },
      hospital: { id: "hospital-1", name: "Rumah Sakit Contoh", code: "RSC" },
    });

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    const dto = await service.getCurrentUser("user-1");

    expect(dto.email).toBe("admin@example.com");
    expect(dto.hospital?.code).toBe("RSC");
    expect(dto.role?.name).toBe("system_admin");
    expect(dto.permissions).toEqual(["rbac.read"]);
  });

  it("throws when the user no longer exists", async () => {
    const { prisma, tenantContextService, passwordService, tokenService, permissionsService } = makeDeps();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const service = new AuthService(prisma, tenantContextService, passwordService, tokenService, permissionsService);
    await expect(service.getCurrentUser("ghost")).rejects.toThrow(UnauthorizedException);
  });
});
