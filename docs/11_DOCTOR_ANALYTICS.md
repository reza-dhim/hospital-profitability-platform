# 11 — Doctor Analytics

Status: Draft v1. Concept and fairness framing: `PRODUCT_BIBLE.md` §7. Fairness enforcement rule: `01_BUSINESS_RULES.md` §7. Access control: `04_RBAC.md` §5.

## 1. Purpose

Explain **why** the same procedure costs differently when performed by different doctors — never to rank or punish, always to inform management conversation and clinical-pathway improvement (per `PRODUCT_BIBLE.md` §7).

## 2. Computation

`doctor_profitability_results`, materialized alongside `profitability_results` (`09_PROFITABILITY_ENGINE.md` §3) from `medical_activities`, grouped by `(doctor_id, service_id, allocation_run)`:
```
revenue        = SUM(medical_activities.revenue)
cost           = SUM(bmhp_cost + room_cost + staff_cost) + apportioned allocated_cost (same method as 10_UNIT_COST_ENGINE.md §3, apportioned further to doctor by volume share)
profit          = revenue - cost
margin          = profit / revenue × 100
avg_duration     = AVG(duration_minutes)
avg_bmhp         = AVG(bmhp_cost)
```

## 3. Variance Analysis

For a given `service_id`, compute the cross-doctor distribution of `unit_cost`-equivalent (`cost / volume`) for that service in the period:
- Median, P25/P75, P90 across doctors performing that service.
- A doctor's variance band = which quartile/percentile their figure falls into, **always shown alongside the contributing factors** (duration, BMHP, room/staff cost breakdown) — a bare ranking number is not a permitted UI state (`01_BUSINESS_RULES.md` §7).
- Minimum sample size: a service/doctor pairing with fewer than 5 cases in the period is excluded from variance comparison (insufficient sample, statistically noisy) and shown as "insufficient data for comparison" rather than a misleading outlier flag.

## 4. Contributing Factor Attribution

Per `PRODUCT_BIBLE.md` §7, variance may stem from: procedure duration, BMHP usage, OR/room duration, staff/anesthesia requirement, equipment usage variation, clinical pathway variation. The comparison view (`GET /doctor-analytics/services/:serviceId/comparison`) must return each factor's contribution, not just the total cost delta, so the "report, not a hammer" framing is structurally supported — e.g.:
```json
{
  "serviceId": "...",
  "doctorId": "...",
  "totalCostDelta": 1250000,
  "factors": [
    { "factor": "bmhp_cost", "doctorAvg": 800000, "cohortMedian": 650000, "delta": 150000 },
    { "factor": "duration_minutes", "doctorAvg": 95, "cohortMedian": 80, "delta": 15 }
  ]
}
```

## 5. Access Control

Enforced per `04_RBAC.md` §5: doctor-identified rows require `doctor_analytics.read_detail`. Roles without it receive the same endpoints with `doctorId`/`doctorName` fields omitted and results pre-aggregated into cohort bands (e.g., "2 of 6 doctors above P75 for Appendectomy") — this is an API-layer contract, not a UI-only mask.

## 6. AI Involvement

AI-generated narrative explanations of doctor variance (`12_AI_ENGINE.md`) must cite the specific `factors` breakdown above and follow the non-punitive language constraints in `13_AI_GOVERNANCE.md` §4.
