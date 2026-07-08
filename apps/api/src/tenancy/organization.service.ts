import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaginationQueryDto, paginationMeta } from "../common/dto/pagination.dto";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import type { OrganizationResponseDto } from "./dto/organization-response.dto";

function notFound(): NotFoundException {
  return new NotFoundException({ code: "ORGANIZATION_NOT_FOUND", message: "Organization not found." });
}

/**
 * There is no platform-admin surface yet (docs/03_MULTI_TENANT.md §3 —
 * deferred), so `create` is not scoped to an existing tenant: any caller
 * holding `organization.write` can bootstrap a new organization. Every other
 * operation is restricted to the caller's own organization (`tenantOrgId`) —
 * a `system_admin` cannot read or manage an organization they don't belong
 * to, even one they just created under a different membership.
 */
@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto): Promise<OrganizationResponseDto> {
    return this.prisma.organization.create({ data: { name: dto.name } });
  }

  async findAll(
    tenantOrgId: string,
    query: PaginationQueryDto
  ): Promise<{ data: OrganizationResponseDto[]; meta: ReturnType<typeof paginationMeta> }> {
    // MVP: a caller belongs to exactly one organization, so "list" is that
    // single organization (or none, if a name search excludes it) — see
    // docs/SPRINT_2_2_REVIEW.md for the multi-org-membership limitation.
    const where = {
      id: tenantOrgId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.organization.count({ where }),
    ]);
    return { data: organizations, meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(tenantOrgId: string, id: string): Promise<OrganizationResponseDto> {
    this.assertOwnOrganization(tenantOrgId, id);
    const organization = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!organization) throw notFound();
    return organization;
  }

  async update(tenantOrgId: string, id: string, dto: UpdateOrganizationDto): Promise<OrganizationResponseDto> {
    this.assertOwnOrganization(tenantOrgId, id);
    const organization = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!organization) throw notFound();
    return this.prisma.organization.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(tenantOrgId: string, id: string): Promise<void> {
    this.assertOwnOrganization(tenantOrgId, id);
    const organization = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!organization) throw notFound();
    await this.prisma.organization.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private assertOwnOrganization(tenantOrgId: string, id: string): void {
    if (id !== tenantOrgId) {
      throw new ForbiddenException({
        code: "TENANT_ORGANIZATION_FORBIDDEN",
        message: "You do not have access to this organization.",
      });
    }
  }
}
