import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { paginationMeta } from "../common/dto/pagination.dto";
import type { JwtPayload } from "../auth/types/jwt-payload.type";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import type { AuditLogResponseDto } from "./dto/audit-log-response.dto";

function noActiveHospital(): BadRequestException {
  return new BadRequestException({
    code: "TENANT_HOSPITAL_REQUIRED",
    message: "This action requires an active hospital context (switch hospital via the X-Hospital-Id header).",
  });
}

/**
 * Read API over `audit_logs` (docs/23_AUDIT_TRAIL.md §4). `Tim Costing`'s
 * "own actions" restriction (§2 table) is enforced here rather than left to
 * the frontend: any `userId` filter it passes is overridden with its own id.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    hospitalId: string | null,
    requestingUser: JwtPayload,
    query: AuditLogQueryDto
  ): Promise<{ data: AuditLogResponseDto[]; meta: ReturnType<typeof paginationMeta> }> {
    if (!hospitalId) throw noActiveHospital();

    const scopedUserId = requestingUser.role === "tim_costing" ? requestingUser.sub : query.userId;

    const where: Prisma.AuditLogWhereInput = {
      hospitalId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(scopedUserId ? { userId: scopedUserId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: logs, meta: paginationMeta(query.page, query.limit, total) };
  }
}
