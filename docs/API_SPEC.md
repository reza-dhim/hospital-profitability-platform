# API Specification Draft

Base URL: /api/v1

## Auth
POST /auth/login
POST /auth/logout
GET /auth/me

## Master Data
GET /cost-centers
POST /cost-centers
GET /cost-centers/:id
PATCH /cost-centers/:id
DELETE /cost-centers/:id

GET /profit-centers
POST /profit-centers
GET /profit-centers/:id
PATCH /profit-centers/:id
DELETE /profit-centers/:id

GET /drivers
POST /drivers
PATCH /drivers/:id
DELETE /drivers/:id

GET /doctors
POST /doctors
PATCH /doctors/:id
DELETE /doctors/:id

GET /services
POST /services
PATCH /services/:id
DELETE /services/:id

## Upload
GET /templates/:type/download
POST /uploads/:type
GET /uploads/:id/validation
POST /uploads/:id/confirm
POST /uploads/:id/rollback

## Calculation
POST /allocation-runs
GET /allocation-runs
GET /allocation-runs/:id
POST /allocation-runs/:id/recalculate

## Profitability
GET /profitability/summary
GET /profitability/profit-centers
GET /profitability/services
GET /profitability/trends

## Doctor Analytics
GET /doctor-analytics/summary
GET /doctor-analytics/doctors
GET /doctor-analytics/services/:serviceId/comparison

## AI
POST /ai/insights
POST /ai/tariff-recommendation
POST /ai/doctor-analysis
POST /ai/what-if
POST /ai/copilot/chat

## Reports
GET /reports/executive/pdf
GET /reports/profitability/excel
GET /reports/doctor-analytics/pdf
