import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

/** docs/06_UPLOAD_ENGINE.md §2: warning-only batches "may be confirmed with an explicit user acknowledgment checkbox". */
export class ConfirmUploadDto {
  @ApiPropertyOptional({ description: "Required (true) if the batch has any warning-severity validation issues." })
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;
}
