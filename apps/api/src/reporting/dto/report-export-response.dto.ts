import { ApiProperty } from "@nestjs/swagger";
import { ReportType } from "@prisma/client";
import { PaginatedResponseDto } from "../../common/dto/pagination.dto";

/** `fileUrl` (the internal S3 object key) is deliberately never exposed — same convention as `UploadResponseDto`. */
export class ReportExportResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ReportType }) reportType!: ReportType;
  @ApiProperty() generatedForPeriodId!: string;
  @ApiProperty({ type: String, nullable: true }) generatedByUserId!: string | null;
  @ApiProperty() generatedAt!: Date;
}

export class PaginatedReportExportResponseDto extends PaginatedResponseDto<ReportExportResponseDto> {
  @ApiProperty({ type: [ReportExportResponseDto] })
  override data: ReportExportResponseDto[] = [];
}
