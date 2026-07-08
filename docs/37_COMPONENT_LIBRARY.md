# 37 — Component Library

Status: Draft v1 — expands the component names listed in `DESIGN_SYSTEM.md` §Component Requirement with purpose, props contract intent, and state requirements. Built on shadcn/ui primitives per `AGENTS.md`. Design rules: `36_DESIGN_PRINCIPLES.md`. Accessibility baseline: `35_ACCESSIBILITY.md`.

## 1. Structural Components

| Component | Purpose | Notes |
|---|---|---|
| `AppShell` | Top-level layout: sidebar + topbar + content area | Handles responsive collapse of sidebar |
| `Sidebar` | Primary navigation across the 9 modules (`prompts/CODEX_INITIAL_PROMPT.md` route list) | Active-route highlighting, role-aware item visibility (`04_RBAC.md`) |
| `Topbar` | Hospital switcher (`03_MULTI_TENANT.md` §4), user menu, notification bell (`16_NOTIFICATION.md`) | |
| `PageHeader` | Title, breadcrumb, primary CTA slot | Mandatory on every page per `AGENTS.md` |

## 2. Data Display

| Component | Purpose | Required States |
|---|---|---|
| `DataTable` | Master data lists, calculation results | loading skeleton, empty, error, populated; server-side pagination/filter/sort (`34_PERFORMANCE_REQUIREMENTS.md` §2) |
| `FilterBar` | Column/date/entity filters above a `DataTable` | reflects active filters as removable chips |
| `MetricCard` | Single KPI display (revenue, margin, etc.) | loading, populated, trend-delta indicator (never color-only, `35_ACCESSIBILITY.md` §2) |
| `InsightCard` | AI-generated insight display | must render `citations_json` as clickable references (`13_AI_GOVERNANCE.md` §3), distinct visual treatment from `MetricCard` so AI content is never confused with calculated fact |
| `AuditTimeline` | Chronological change history | used both embedded (entity detail page) and standalone (`23_AUDIT_TRAIL.md`) |

## 3. Input & Workflow

| Component | Purpose | Notes |
|---|---|---|
| `UploadDropzone` | File upload entry point | drag-drop + click, shows template-download link inline (`06_UPLOAD_ENGINE.md`) |
| `ValidationResult` | Row-level validation summary/detail | groups by severity (`07_VALIDATION_ENGINE.md`), links each error to the offending row |
| `WizardStepper` | Multi-step flows (onboarding, `UX_ONBOARDING_GUIDE.md`) | resumable (`22_ACCEPTANCE_CRITERIA.md` §1), shows progress + step validation |

## 4. Guidance & Feedback

| Component | Purpose |
|---|---|
| `EmptyState` | Title + description + CTA, per `UX_ONBOARDING_GUIDE.md` pattern |
| `ErrorState` | Retry affordance + human-readable message (`17_ERROR_HANDLING.md` §3) |
| `LoadingSkeleton` | Shape-matched placeholder for the content being loaded, never a generic spinner for data-heavy views |
| `GuidedTooltip` | Contextual help (`UX_ONBOARDING_GUIDE.md` tooltip examples) |
| `ProductTour` | Spotlight overlay sequence (`UX_ONBOARDING_GUIDE.md` §Product Tour) |

## 5. Component Contract Rules

- Every component that renders data (`DataTable`, `MetricCard`, `InsightCard`) accepts the four-state contract (loading/empty/error/success) as its own internal responsibility, not something each page re-implements — this is the concrete mechanism satisfying `AGENTS.md`'s per-page state mandate without duplicated logic per screen.
- No component hardcodes copy strings inline — all text sourced from the i18n resource layer (`35_ACCESSIBILITY.md` §4).
- Components consuming financial figures never format/round independently — formatting utilities are shared (`18_FORMULA_REFERENCE.md` §3 precision rule extends to display formatting consistency).
