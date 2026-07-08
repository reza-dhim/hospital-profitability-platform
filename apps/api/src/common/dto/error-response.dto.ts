import { ApiProperty } from "@nestjs/swagger";

/** Mirrors the envelope in docs/17_ERROR_HANDLING.md §1. */
export class ErrorDetailDto {
  @ApiProperty({ required: false })
  field?: string;

  @ApiProperty({ required: false })
  issue?: string;
}

export class ErrorBodyDto {
  @ApiProperty({ description: "Stable, machine-readable, namespaced error code." })
  code!: string;

  @ApiProperty({ description: "Human-readable summary, always safe to display." })
  message!: string;

  @ApiProperty({ type: [ErrorDetailDto], required: false })
  details?: ErrorDetailDto[];

  @ApiProperty({ description: "Correlates to server-side structured logs." })
  traceId!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
