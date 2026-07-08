import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaginationQueryDto, paginationMeta } from "../common/dto/pagination.dto";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { UpdateBranchDto } from "./dto/update-branch.dto";
import type { BranchResponseDto } from "./dto/branch-response.dto";

function notFound(): NotFoundException {
  return new NotFoundException({ code: "BRANCH_NOT_FOUND", message: "Branch not found." });
}

function noActiveHospital(): BadRequestException {
  return new BadRequestException({
    code: "TENANT_HOSPITAL_REQUIRED",
    message: "This action requires an active hospital context (switch hospital via the X-Hospital-Id header).",
  });
}

/** Branches belong to the caller's effective hospital (docs/03_MULTI_TENANT.md §1) — optional finer-grained site tagging. */
@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(hospitalId: string | null, dto: CreateBranchDto, actorUserId: string): Promise<BranchResponseDto> {
    if (!hospitalId) throw noActiveHospital();

    const existing = await this.prisma.branch.findUnique({ where: { hospitalId_code: { hospitalId, code: dto.code } } });
    if (existing) {
      throw new ConflictException({ code: "BRANCH_CODE_TAKEN", message: `Branch code "${dto.code}" already exists.` });
    }

    return this.prisma.branch.create({
      data: { hospitalId, name: dto.name, code: dto.code, createdByUserId: actorUserId, updatedByUserId: actorUserId },
    });
  }

  async findAll(
    hospitalId: string | null,
    query: PaginationQueryDto
  ): Promise<{ data: BranchResponseDto[]; meta: ReturnType<typeof paginationMeta> }> {
    if (!hospitalId) throw noActiveHospital();

    const where = {
      hospitalId,
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
    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return { data: branches, meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(hospitalId: string | null, id: string): Promise<BranchResponseDto> {
    if (!hospitalId) throw noActiveHospital();
    const branch = await this.prisma.branch.findFirst({ where: { id, hospitalId, deletedAt: null } });
    if (!branch) throw notFound();
    return branch;
  }

  async update(
    hospitalId: string | null,
    id: string,
    dto: UpdateBranchDto,
    actorUserId: string
  ): Promise<BranchResponseDto> {
    await this.findOne(hospitalId, id);
    return this.prisma.branch.update({
      where: { id },
      data: { name: dto.name, code: dto.code, updatedByUserId: actorUserId },
    });
  }

  async remove(hospitalId: string | null, id: string, actorUserId: string): Promise<void> {
    await this.findOne(hospitalId, id);
    await this.prisma.branch.update({ where: { id }, data: { deletedAt: new Date(), updatedByUserId: actorUserId } });
  }
}
