import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  NotImplementedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, UploadType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { UploadQueueService } from "../queue/upload-queue.service";
import { PeriodService } from "../period/period.service";
import { paginationMeta, PaginationMetaDto, PaginationQueryDto } from "../common/dto/pagination.dto";
import { SUPPORTED_UPLOAD_TYPES } from "./upload.constants";
import { VIRUS_SCANNER, VirusScanner } from "./virus-scanner";
import { isValidXlsx } from "./xlsx.util";
import { CreateUploadDto } from "./dto/create-upload.dto";
import { ListUploadsDto } from "./dto/list-uploads.dto";
import type { UploadResponseDto } from "./dto/upload-response.dto";
import type { ValidationResultResponseDto } from "./dto/validation-result.dto";

/**
 * Never selects `fileUrl` — it's an internal S3 object key, not something
 * any API response exposes. Exported for reuse by `ConfirmService`, which
 * returns the same `UploadResponseDto` shape after confirm/rollback.
 */
export const UPLOAD_BATCH_SELECT = {
  id: true,
  hospitalId: true,
  type: true,
  periodId: true,
  fileName: true,
  uploadedByUserId: true,
  status: true,
  rowCount: true,
  errorCount: true,
  createdAt: true,
  confirmedAt: true,
  rolledBackAt: true,
} satisfies Prisma.UploadBatchSelect;

export function uploadNotFound(): NotFoundException {
  return new NotFoundException({ code: "UPLOAD_NOT_FOUND", message: "Upload batch not found." });
}

/**
 * Upload intake (docs/06_UPLOAD_ENGINE.md §2 steps 1-3). Parsing/validation
 * (steps 3-5, `upload_rows_staging`/`validation_errors`) are a later
 * sub-task's `@Processor(UPLOAD_QUEUE_NAME)` consumer for the `upload.parse`
 * job this enqueues — this service's job ends at "the file is safely stored
 * and a `staged` batch row exists", matching the pipeline diagram's own
 * step boundary.
 */
@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly uploadQueueService: UploadQueueService,
    private readonly periodService: PeriodService,
    @Inject(VIRUS_SCANNER) private readonly virusScanner: VirusScanner
  ) {}

  async create(
    hospitalId: string,
    organizationId: string,
    type: UploadType,
    dto: CreateUploadDto,
    file: Express.Multer.File,
    actorUserId: string
  ): Promise<UploadResponseDto> {
    if (!SUPPORTED_UPLOAD_TYPES.includes(type)) {
      throw new NotImplementedException({
        code: "UPLOAD_TYPE_NOT_YET_SUPPORTED",
        message: `Upload type '${type}' is not yet supported (Sprint 4 currently accepts: ${SUPPORTED_UPLOAD_TYPES.join(", ")}).`,
      });
    }

    // docs/25_PERIOD_CLOSING.md §1: uploads only allowed while the target period is 'open'.
    const period = await this.periodService.findOne(hospitalId, dto.periodId);
    if (period.status !== "open") {
      throw new UnprocessableEntityException({
        code: "PERIOD_NOT_OPEN",
        message: `Cannot upload to period '${period.label}' — it is '${period.status}', not open.`,
      });
    }

    const settings = await this.prisma.hospitalSettings.findUnique({ where: { hospitalId } });
    const maxBytes = (settings?.maxUploadFileSizeMb ?? 25) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException({
        code: "E_FILE_TOO_LARGE",
        message: `File exceeds this hospital's ${settings?.maxUploadFileSizeMb ?? 25}MB upload limit.`,
      });
    }

    // docs/06_UPLOAD_ENGINE.md §4: MIME-type/signature validation "not just extension", before parsing.
    if (!(await isValidXlsx(file.buffer))) {
      throw new BadRequestException({ code: "E_FILE_FORMAT", message: "File is not a valid .xlsx file." });
    }

    const id = randomUUID();
    const key = this.storageService.buildUploadKey(organizationId, hospitalId, id);

    const scanResult = await this.virusScanner.scan(file.buffer);
    if (!scanResult.clean) {
      // docs/06_UPLOAD_ENGINE.md §4: infected files are rejected with
      // status=failed and never reach the parse stage — nor, deliberately,
      // storage: no reason to persist malware into the bucket.
      return this.prisma.uploadBatch.create({
        data: {
          id,
          hospitalId,
          type,
          periodId: dto.periodId,
          fileName: file.originalname,
          fileUrl: key,
          uploadedByUserId: actorUserId,
          status: "failed",
        },
        select: UPLOAD_BATCH_SELECT,
      });
    }

    await this.storageService.putObject(key, file.buffer, file.mimetype);

    const created = await this.prisma.uploadBatch.create({
      data: {
        id,
        hospitalId,
        type,
        periodId: dto.periodId,
        fileName: file.originalname,
        fileUrl: key,
        uploadedByUserId: actorUserId,
        status: "staged",
      },
      select: UPLOAD_BATCH_SELECT,
    });

    // hospitalId/organizationId/uploadedByUserId travel with the job because
    // the BullMQ worker (ParseService) runs outside any HTTP request — there
    // is no TenantContextService store for it to read tenant context from,
    // so the payload has to carry what the enqueuing request already knew.
    await this.uploadQueueService.enqueue("upload.parse", {
      uploadBatchId: created.id,
      hospitalId,
      organizationId,
      uploadedByUserId: actorUserId,
    });

    return created;
  }

  async findAll(
    hospitalId: string,
    query: ListUploadsDto
  ): Promise<{ data: UploadResponseDto[]; meta: PaginationMetaDto }> {
    const where: Prisma.UploadBatchWhereInput = {
      hospitalId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.uploadBatch.findMany({
        where,
        select: UPLOAD_BATCH_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.uploadBatch.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.limit, total) };
  }

  async findOne(hospitalId: string, id: string): Promise<UploadResponseDto> {
    const batch = await this.prisma.uploadBatch.findFirst({
      where: { id, hospitalId },
      select: UPLOAD_BATCH_SELECT,
    });
    if (!batch) throw uploadNotFound();
    return batch;
  }

  /** docs/07_VALIDATION_ENGINE.md §4's exact contract — paginated `errors` (200/page default via `query.limit`). */
  async getValidationResult(
    hospitalId: string,
    id: string,
    query: PaginationQueryDto
  ): Promise<ValidationResultResponseDto> {
    const batch = await this.findOne(hospitalId, id);

    const [totalRows, errorRows, total, errors, warningRowNumbers] = await Promise.all([
      this.prisma.uploadRowStaging.count({ where: { uploadBatchId: id } }),
      this.prisma.uploadRowStaging.count({ where: { uploadBatchId: id, status: "invalid" } }),
      this.prisma.validationError.count({ where: { uploadBatchId: id } }),
      this.prisma.validationError.findMany({
        where: { uploadBatchId: id },
        orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.validationError.findMany({
        where: { uploadBatchId: id, severity: "warning" },
        select: { rowNumber: true },
        distinct: ["rowNumber"],
      }),
    ]);

    return {
      uploadBatchId: id,
      status: batch.status,
      summary: {
        totalRows,
        validRows: totalRows - errorRows,
        errorRows,
        warningRows: warningRowNumbers.length,
      },
      errors: errors.map((error) => ({
        rowNumber: error.rowNumber,
        column: error.columnName,
        code: error.errorCode,
        severity: error.severity,
        message: error.message,
      })),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }
}
