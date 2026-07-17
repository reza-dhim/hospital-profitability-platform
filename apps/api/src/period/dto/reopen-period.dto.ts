import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/** docs/25_PERIOD_CLOSING.md §2: reopen requires a typed reason, stored on the audit entry. */
export class ReopenPeriodDto {
  @ApiProperty({ description: "Why this period is being reopened.", example: "Board correction requested for Q2 figures." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
