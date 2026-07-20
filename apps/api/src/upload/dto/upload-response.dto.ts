import { ApiProperty } from "@nestjs/swagger";
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
  @ApiProperty({ type: Number, nullable: true, description: "Null until parsing completes." })
  rowCount!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: "Null until validation completes." })
  errorCount!: number | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true, description: "Null until the batch is confirmed." })
  confirmedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true, description: "Null unless the batch was rolled back." })
  rolledBackAt!: Date | null;
}

export class PaginatedUploadResponseDto extends PaginatedResponseDto<UploadResponseDto> {
  @ApiProperty({ type: [UploadResponseDto] })
  override data: UploadResponseDto[] = [];
}
