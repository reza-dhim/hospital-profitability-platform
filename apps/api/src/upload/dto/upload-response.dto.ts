import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UploadBatchStatus, UploadType } from "@prisma/client";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

/** `fileUrl` (the internal S3 object key) is deliberately never exposed here — see `UploadService`'s `UPLOAD_BATCH_SELECT`. */
export class UploadResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hospitalId!: string;
  @ApiProperty({ enum: UploadType }) type!: UploadType;
  @ApiProperty() periodId!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() uploadedByUserId!: string;
  @ApiProperty({ enum: UploadBatchStatus }) status!: UploadBatchStatus;
  @ApiPropertyOptional() rowCount?: number | null;
  @ApiPropertyOptional() errorCount?: number | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() confirmedAt?: Date | null;
  @ApiPropertyOptional() rolledBackAt?: Date | null;
}

export class PaginatedUploadResponseDto extends PaginatedResponseDto<UploadResponseDto> {
  @ApiProperty({ type: [UploadResponseDto] })
  override data: UploadResponseDto[] = [];
}
