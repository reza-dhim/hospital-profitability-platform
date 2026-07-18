import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UploadBatchStatus, ValidationSeverity } from "@prisma/client";
import { PaginationMetaDto } from "../../common/dto/pagination.dto";

export class ValidationErrorDto {
  @ApiPropertyOptional({ description: "Null for a file-level structural error (e.g. E_TEMPLATE_VERSION)." })
  rowNumber!: number | null;

  @ApiPropertyOptional()
  column?: string | null;

  @ApiProperty({ example: "E_INVALID_COST_CENTER" })
  code!: string;

  @ApiProperty({ enum: ValidationSeverity })
  severity!: ValidationSeverity;

  @ApiProperty()
  message!: string;
}

export class ValidationSummaryDto {
  @ApiProperty() totalRows!: number;
  @ApiProperty() validRows!: number;
  @ApiProperty() errorRows!: number;
  @ApiProperty() warningRows!: number;
}

/** docs/07_VALIDATION_ENGINE.md §4's exact contract (`uploadBatchId`/`status`/`summary`/`errors`), plus `meta` for the documented "paginated when errors exceed 200" behavior. */
export class ValidationResultResponseDto {
  @ApiProperty() uploadBatchId!: string;
  @ApiProperty({ enum: UploadBatchStatus }) status!: UploadBatchStatus;
  @ApiProperty({ type: ValidationSummaryDto }) summary!: ValidationSummaryDto;
  @ApiProperty({ type: [ValidationErrorDto] }) errors!: ValidationErrorDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
