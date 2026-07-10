import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditContextService } from "../../audit/audit-context.service";
import { UpdateHospitalSettingsDto } from "./dto/update-hospital-settings.dto";
import type { HospitalSettingsResponseDto } from "./dto/hospital-settings-response.dto";

/**
 * Singleton config row per hospital (docs/24_CONFIGURATION.md) — one row,
 * get-or-create on first read, no list/soft-delete surface, so it doesn't go
 * through the generic list-based CRUD engine (`common/crud`) the other 12
 * entities use.
 */
@Injectable()
export class HospitalSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditContextService: AuditContextService
  ) {}

  async getOrCreate(hospitalId: string, actorUserId: string): Promise<HospitalSettingsResponseDto> {
    const existing = await this.prisma.hospitalSettings.findUnique({ where: { hospitalId } });
    if (existing) return existing;

    // Defaults per docs/24_CONFIGURATION.md §1 (schema @default already
    // matches — this just materializes the row on first access).
    return this.prisma.hospitalSettings.create({
      data: { hospitalId, createdByUserId: actorUserId, updatedByUserId: actorUserId },
    });
  }

  async update(
    hospitalId: string,
    dto: UpdateHospitalSettingsDto,
    actorUserId: string
  ): Promise<HospitalSettingsResponseDto> {
    const before = await this.getOrCreate(hospitalId, actorUserId);
    const after = await this.prisma.hospitalSettings.update({
      where: { hospitalId },
      data: { ...dto, updatedByUserId: actorUserId },
    });

    this.auditContextService.record({
      entity: "hospital_settings",
      action: "hospital_settings.update",
      entityId: after.id,
      before,
      after,
    });
    return after;
  }
}
