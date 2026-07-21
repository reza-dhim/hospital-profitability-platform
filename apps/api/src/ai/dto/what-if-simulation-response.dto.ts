import { ApiProperty } from "@nestjs/swagger";
import { VarianceDto } from "../../profitability/dto/variance-response.dto";

/** Same shape used for both the real baseline and the hypothetical figures — lets the frontend render them side by side without special-casing. */
export class WhatIfServiceFiguresDto {
  @ApiProperty() tariff!: string;
  @ApiProperty() volume!: string;
  @ApiProperty() allocatedCost!: string;
  @ApiProperty() directCost!: string;
  @ApiProperty() totalCost!: string;
  @ApiProperty({ type: String, nullable: true, description: "Null when volume is zero." })
  unitCost!: string | null;
  @ApiProperty({ type: String, nullable: true }) tariffGap!: string | null;
  @ApiProperty({ type: String, nullable: true }) recommendedTariff!: string | null;
  @ApiProperty() revenue!: string;
}

/** `directCost`/`allocatedCost`/`totalCost` are identical between baseline and hypothetical — this service's revenue is the only thing that ripples up to its profit center (docs/12_AI_ENGINE.md §4 scope: single-service simulation). */
export class WhatIfProfitCenterFiguresDto {
  @ApiProperty() revenue!: string;
  @ApiProperty() directCost!: string;
  @ApiProperty() allocatedCost!: string;
  @ApiProperty() totalCost!: string;
  @ApiProperty() grossProfit!: string;
  @ApiProperty({ type: String, nullable: true }) margin!: string | null;
}

export class WhatIfServiceDeltasDto {
  @ApiProperty({ type: VarianceDto }) revenue!: VarianceDto;
  @ApiProperty({ type: VarianceDto }) totalCost!: VarianceDto;
  @ApiProperty({ type: VarianceDto, nullable: true, description: "Null when either baseline or hypothetical unit cost is null (zero volume)." })
  unitCost!: VarianceDto | null;
  @ApiProperty({ type: VarianceDto, nullable: true }) tariffGap!: VarianceDto | null;
}

export class WhatIfProfitCenterDeltasDto {
  @ApiProperty({ type: VarianceDto }) revenue!: VarianceDto;
  @ApiProperty({ type: VarianceDto }) grossProfit!: VarianceDto;
  @ApiProperty({ type: VarianceDto, nullable: true }) margin!: VarianceDto | null;
}

/**
 * docs/12_AI_ENGINE.md §4 — "Clearly labeled 'Simulation — not saved' in
 * the UI." Deliberately has no `id`/`createdAt` — nothing here is ever
 * persisted; every field is computed fresh from the latest completed run's
 * real data plus the caller's hypothetical input, per-request.
 */
export class WhatIfSimulationResponseDto {
  @ApiProperty() allocationRunId!: string;
  @ApiProperty() periodId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty() serviceCode!: string;
  @ApiProperty() serviceName!: string;
  @ApiProperty() profitCenterId!: string;
  @ApiProperty() profitCenterCode!: string;
  @ApiProperty() profitCenterName!: string;

  @ApiProperty({ type: WhatIfServiceFiguresDto }) serviceBaseline!: WhatIfServiceFiguresDto;
  @ApiProperty({ type: WhatIfServiceFiguresDto }) serviceHypothetical!: WhatIfServiceFiguresDto;
  @ApiProperty({ type: WhatIfServiceDeltasDto }) serviceDeltas!: WhatIfServiceDeltasDto;

  @ApiProperty({ type: WhatIfProfitCenterFiguresDto }) profitCenterBaseline!: WhatIfProfitCenterFiguresDto;
  @ApiProperty({ type: WhatIfProfitCenterFiguresDto }) profitCenterHypothetical!: WhatIfProfitCenterFiguresDto;
  @ApiProperty({ type: WhatIfProfitCenterDeltasDto }) profitCenterDeltas!: WhatIfProfitCenterDeltasDto;
}
