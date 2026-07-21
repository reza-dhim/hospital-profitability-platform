import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type DoctorAnalyticsSummary = components["schemas"]["DoctorAnalyticsSummaryResponseDto"];
export type DoctorAnalyticsSummaryRow = components["schemas"]["DoctorAnalyticsSummaryRowDto"];
export type DoctorComparisonIdentified = components["schemas"]["DoctorComparisonIdentifiedResponseDto"];
export type DoctorComparisonAggregate = components["schemas"]["DoctorComparisonAggregateResponseDto"];
/** The comparison endpoint's response shape is server-decided (docs/04_RBAC.md §5) — callers must branch on which fields are present, never assume one shape. */
export type DoctorComparison = DoctorComparisonIdentified | DoctorComparisonAggregate;
export type CohortDistribution = components["schemas"]["CohortDistributionDto"];
export type ComparisonFactor = components["schemas"]["ComparisonFactorDto"];

/** A response is the identified shape iff it carries `doctorId` — the one field the aggregate shape never has. */
export function isIdentifiedComparison(comparison: DoctorComparison): comparison is DoctorComparisonIdentified {
  return "doctorId" in comparison;
}

/** docs/11_DOCTOR_ANALYTICS.md — read-only, reads materialized doctor_profitability_results/medical_activities, scoped to the latest completed non-stale run for `periodId`. */
export const doctorAnalyticsApi = {
  summary: (periodId: string) => apiRequest<DoctorAnalyticsSummary>("/doctor-analytics/summary", { query: { periodId } }),

  /** `doctorId` is only honored server-side for callers holding doctor_analytics.read_detail — omitting it always returns the de-identified shape. */
  comparison: (serviceId: string, periodId: string, doctorId?: string) =>
    apiRequest<DoctorComparison>(`/doctor-analytics/services/${serviceId}/comparison`, { query: { periodId, doctorId } }),
};
