import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type WhatIfSimulationResult = components["schemas"]["WhatIfSimulationResponseDto"];

export interface WhatIfSimulationInput {
  periodId: string;
  serviceId: string;
  allocationRunId?: string;
  hypotheticalTariff?: number;
  hypotheticalVolume?: number;
}

/** docs/12_AI_ENGINE.md §4 — ephemeral, request-scoped recomputation; never persisted server-side, so there's nothing to invalidate/refetch after calling this. */
export const whatIfApi = {
  simulate: (input: WhatIfSimulationInput) => apiRequest<WhatIfSimulationResult>("/ai/what-if", { method: "POST", body: input }),
};
