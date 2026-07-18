import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

/** The file itself arrives as multipart form data (`@UploadedFile()`), not part of this validated body. */
export class CreateUploadDto {
  @ApiProperty({ description: "Target period id. Upload is rejected (422) unless this period is 'open'." })
  @IsString()
  periodId!: string;
}
