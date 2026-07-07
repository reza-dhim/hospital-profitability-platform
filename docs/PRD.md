# Product Requirement Document

## Product Name
AI Hospital Profitability Intelligence Platform

## Target Users
- Direktur Rumah Sakit
- CFO / Finance Director
- Tim Costing
- Kepala Unit
- Manajemen Medis
- Admin Sistem

## Main Modules
1. Authentication & RBAC
2. Hospital & Branch Management
3. Master Data
4. Bulk Upload Excel Template
5. Validation Engine
6. Cost Allocation Engine
7. Unit Cost Engine
8. Profitability Engine
9. Tariff Recommendation
10. Doctor Analytics
11. Executive Dashboard
12. AI Copilot
13. Reporting
14. Audit Trail

## Functional Requirement Summary

### Master Data
Sistem harus mendukung master data:
- Hospital
- Branch
- Department
- Cost Center
- Profit Center
- COA
- Driver
- Service/Treatment
- Doctor
- Employee
- Asset
- Tariff
- Vendor
- Material/BMHP

### Bulk Upload
User dapat download template dan upload data bulk:
- Cost
- Revenue
- Driver
- Asset
- Employee
- Medical Activity
- BMHP
- Tariff

### Validation
Sistem harus memvalidasi:
- format file
- required column
- missing value
- duplicate row
- invalid cost center
- invalid profit center
- invalid driver
- invalid period
- outlier nominal
- mapping mismatch

### Calculation
Sistem harus menghitung:
- direct cost
- indirect cost
- allocated cost
- unit cost
- revenue
- profit
- margin
- variance
- doctor cost variance

### Dashboard
Dashboard harus memiliki:
- executive KPI
- revenue trend
- cost trend
- profit margin trend
- top profit center
- bottom profit center
- top cost center
- doctor variance
- AI insight

## Acceptance Criteria
- User baru dapat menyelesaikan setup dengan onboarding wizard.
- User dapat upload Excel dan melihat hasil validasi.
- User dapat menjalankan recalculation.
- User dapat melihat profit center ranking.
- User dapat melihat rekomendasi tarif.
- User dapat melihat variasi biaya antar dokter.
