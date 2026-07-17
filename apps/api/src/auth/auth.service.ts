import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { AuditContextService } from "../audit/audit-context.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { PermissionsService } from "./permissions.service";
import { ACCESS_TOKEN_TTL_SECONDS } from "./auth.constants";
import type { JwtPayload } from "./types/jwt-payload.type";
import type { CurrentUserDto } from "./dto/current-user.dto";

export interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: "AUTH_INVALID_CREDENTIALS",
    message: "Invalid email or password.",
  });
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    code: "AUTH_INVALID_REFRESH_TOKEN",
    message: "Refresh token is invalid, expired, or has already been used.",
  });
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly permissionsService: PermissionsService,
    private readonly auditContextService: AuditContextService
  ) {}

  /**
   * Unknown email, wrong password, and a non-active account all fail the
   * same way — see docs/05_AUTHENTICATION.md plan's "generic invalid
   * credentials" decision (avoids account-enumeration).
   *
   * `setAuthBypass()` must run before any DB call: login looks a user up by
   * email precisely because no tenant is known yet (docs/03_MULTI_TENANT.md
   * §2's `users`/`refresh_tokens`/`role_permissions` RLS policies allow this
   * one narrow, transaction-local escape hatch for that reason).
   */
  async login(email: string, password: string, context: RequestContext): Promise<IssuedTokens> {
    this.tenantContextService.setAuthBypass();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user || user.deletedAt || user.status !== "active") {
      this.recordLoginFailure(user?.id ?? null, email);
      throw invalidCredentials();
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordValid) {
      this.recordLoginFailure(user.id, email);
      throw invalidCredentials();
    }

    const tokens = await this.issueTokens(
      user.id,
      user.organizationId,
      user.hospitalId,
      user.roleId,
      user.role?.name ?? null,
      context
    );

    this.auditContextService.record({
      entity: "auth",
      action: "auth.login.success",
      entityId: user.id,
      userId: user.id,
      after: null,
    });

    return tokens;
  }

  /**
   * docs/23_AUDIT_TRAIL.md §3's "authentication failures... logged by the
   * auth module directly" carve-out. `userId` is the matched account's id
   * when the email matched but the password/status check failed (valuable
   * for detecting brute-force against one account), or `null` when the
   * email matched no user at all — never a reason to reveal which case it
   * was in the API response (`invalidCredentials()` stays generic either
   * way). `email` is the attempted login identifier, not a password or
   * token, and is the whole point of a security-monitoring log entry.
   */
  private recordLoginFailure(userId: string | null, email: string): void {
    this.auditContextService.record({
      entity: "auth",
      action: "auth.login.failure",
      entityId: userId,
      userId,
      after: { email },
    });
  }

  /**
   * Rotates the refresh token. Presenting an already-rotated (revoked) token
   * is treated as a replay signal: every active token for that user is
   * revoked and the request fails, per docs/05_AUTHENTICATION.md §1.
   */
  async refresh(rawRefreshToken: string, context: RequestContext): Promise<IssuedTokens> {
    this.tenantContextService.setAuthBypass();
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw invalidRefreshToken();
    }

    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalidRefreshToken();
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw invalidRefreshToken();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
      include: { role: true },
    });

    if (!user || user.deletedAt || user.status !== "active") {
      throw invalidRefreshToken();
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(
      user.id,
      user.organizationId,
      user.hospitalId,
      user.roleId,
      user.role?.name ?? null,
      context
    );

    this.auditContextService.record({
      entity: "auth",
      action: "auth.refresh",
      entityId: user.id,
      userId: user.id,
      after: null,
    });

    return tokens;
  }

  /** Idempotent: a missing/already-revoked token is not an error, and not audit-logged (nothing happened). */
  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    this.tenantContextService.setAuthBypass();
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (existing && !existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      this.auditContextService.record({
        entity: "auth",
        action: "auth.logout",
        entityId: existing.userId,
        userId: existing.userId,
        after: null,
      });
    }
  }

  async getCurrentUser(userId: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true, hospital: true, role: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException({ code: "AUTH_USER_NOT_FOUND", message: "User no longer exists." });
    }

    const permissions = await this.permissionsService.getPermissionCodes(user.roleId);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      organization: { id: user.organization.id, name: user.organization.name },
      hospital: user.hospital
        ? { id: user.hospital.id, name: user.hospital.name, code: user.hospital.code }
        : null,
      role: user.role ? { id: user.role.id, name: user.role.name } : null,
      permissions,
    };
  }

  private async issueTokens(
    userId: string,
    organizationId: string,
    hospitalId: string | null,
    roleId: string | null,
    roleName: string | null,
    context: RequestContext
  ): Promise<IssuedTokens> {
    const permissions = await this.permissionsService.getPermissionCodes(roleId);
    const permissionsHash = this.permissionsService.hashPermissions(permissions);

    const payload: JwtPayload = {
      sub: userId,
      org_id: organizationId,
      active_hospital_id: hospitalId,
      role: roleName,
      permissions_hash: permissionsHash,
    };

    const accessToken = this.tokenService.signAccessToken(payload);
    const { token: refreshToken, tokenHash, expiresAt } = this.tokenService.generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }
}
