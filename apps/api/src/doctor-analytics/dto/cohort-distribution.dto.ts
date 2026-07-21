import { ApiProperty } from "@nestjs/swagger";

/** docs/11_DOCTOR_ANALYTICS.md §3's exact cut points — never doctor-identified, safe in both response shapes. */
export class CohortDistributionDto {
  @ApiProperty() median!: string;
  @ApiProperty() p25!: string;
  @ApiProperty() p75!: string;
  @ApiProperty() p90!: string;
  @ApiProperty() doctorCount!: number;
}
