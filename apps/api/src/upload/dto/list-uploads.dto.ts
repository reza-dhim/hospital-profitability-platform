import { ApiPropertyOptional } from "@nestjs/swagger";
import { UploadBatchStatus, UploadType } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";

export class ListUploadsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UploadType })
  @IsOptional()
  @IsEnum(UploadType)
  type?: UploadType;

  @ApiPropertyOptional({ enum: UploadBatchStatus })
  @IsOptional()
  @IsEnum(UploadBatchStatus)
  status?: UploadBatchStatus;
}
