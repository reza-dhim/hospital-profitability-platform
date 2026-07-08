import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaginationQueryDto, paginationMeta } from "../common/dto/pagination.dto";
import { seedDefaultRolesForHospital } from "../rbac/rbac-seed";
import { CreateHospitalDto } from "./dto/create-hospital.dto";
import { UpdateHospitalDto } from "./dto/update-hospital.dto";
import type { HospitalResponseDto } from "./dto/hospital-response.dto";

function notFound(): NotFoundException {
  return new NotFoundException({ code: "HOSPITAL_NOT_FOUND", message: "Hospital not found." });
}

/** Hospitals are created under the caller's own organization (docs/03_MULTI_TENANT.md §5). */
@Injectable()
export class HospitalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateHospitalDto, actorUserId: string): Promise<HospitalResponseDto> {
    const existing = await this.prisma.hospital.findUnique({
      where: { organizationId_code: { organizationId, code: dto.code } },
    });
    if (existing) {
      throw new ConflictException({ code: "HOSPITAL_CODE_TAKEN", message: `Hospital code "${dto.code}" already exists.` });
    }

    const hospital = await this.prisma.hospital.create({
      data: {
        organizationId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });

    // docs/03_MULTI_TENANT.md §5: new-hospital onboarding seeds default roles.
    await seedDefaultRolesForHospital(this.prisma, hospital.id);

    return hospital;
  }

  async findAll(
    organizationId: string,
    query: PaginationQueryDto
  ): Promise<{ data: HospitalResponseDto[]; meta: ReturnType<typeof paginationMeta> }> {
    const where = {
      organizationId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { code: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [hospitals, total] = await Promise.all([
      this.prisma.hospital.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.hospital.count({ where }),
    ]);
    return { data: hospitals, meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(organizationId: string, id: string): Promise<HospitalResponseDto> {
    const hospital = await this.prisma.hospital.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!hospital) throw notFound();
    return hospital;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateHospitalDto,
    actorUserId: string
  ): Promise<HospitalResponseDto> {
    await this.findOne(organizationId, id);
    return this.prisma.hospital.update({
      where: { id },
      data: { name: dto.name, code: dto.code, address: dto.address, updatedByUserId: actorUserId },
    });
  }

  async remove(organizationId: string, id: string, actorUserId: string): Promise<void> {
    await this.findOne(organizationId, id);
    await this.prisma.hospital.update({
      where: { id },
      data: { deletedAt: new Date(), updatedByUserId: actorUserId },
    });
  }
}
