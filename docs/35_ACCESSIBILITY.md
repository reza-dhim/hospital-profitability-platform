# 35 — Accessibility

Status: Draft v1 — resolves the "no accessibility requirement" gap in `ARCHITECT_AUDIT.md`. Applies to all UI defined in `DESIGN_SYSTEM.md`, `37_COMPONENT_LIBRARY.md`, `38_DASHBOARD_SPECIFICATION.md`.

## 1. Standard

- Target: **WCAG 2.1 Level AA** for all user-facing screens. This is an enterprise B2B product; hospital procurement/IT evaluation processes increasingly require an accessibility conformance statement, and internal hospital staff (the personas in `20_PERSONAS.md`) are a captive audience who must be able to use the tool regardless of ability.

## 2. Concrete Requirements

- Color is never the sole means of conveying information (e.g., profit/loss must use icon or text label alongside red/green — directly relevant given `38_DASHBOARD_SPECIFICATION.md`'s heavy use of margin/variance coloring).
- All interactive elements keyboard-navigable and screen-reader labeled, including chart interactions (ECharts elements need accessible data-table fallbacks or ARIA descriptions for key figures, not just visual tooltips).
- Minimum contrast ratio 4.5:1 for body text, 3:1 for large text/UI components, checked against both light and dark mode (`DESIGN_SYSTEM.md` does not yet specify dark mode — see `36_DESIGN_PRINCIPLES.md` §4).
- Form validation errors (`06_UPLOAD_ENGINE.md`, master-data forms) are associated with their field via ARIA (`aria-describedby`), not conveyed by color/position alone.
- Data tables (`DataTable` component) use proper semantic table markup with header associations, not div-based visual-only tables.

## 3. Testing

- Automated accessibility linting (axe-core or equivalent) integrated into the frontend CI pipeline (`29_DEPLOYMENT.md` §2), failing the build on new critical/serious violations.
- Manual screen-reader spot-check (NVDA/VoiceOver) on the core journeys (`19_USER_JOURNEY.md`) before each major release.

## 4. Internationalization (i18n)

- Per `21_NON_FUNCTIONAL_REQUIREMENTS.md` §7, Indonesian-first with English as secondary. All user-facing strings (including error messages, `17_ERROR_HANDLING.md` §3, and empty-state copy, `UX_ONBOARDING_GUIDE.md`) are externalized into a translation resource layer from the start, even though only one locale ships at MVP — retrofitting i18n after hardcoding strings throughout is far more expensive than building on the abstraction from day one.

## 5. Out of Scope for MVP

- Full WCAG AAA conformance.
- RTL layout support (not needed for Indonesian/English).
