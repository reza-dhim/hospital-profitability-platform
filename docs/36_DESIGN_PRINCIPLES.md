# 36 — Design Principles

Status: Draft v1 — elaborates `DESIGN_SYSTEM.md`'s directional statements ("enterprise, modern, clean...") into concrete, checkable principles. Read together with `35_ACCESSIBILITY.md`, `37_COMPONENT_LIBRARY.md`, `38_DASHBOARD_SPECIFICATION.md`.

## 1. From Feeling to Rule

`DESIGN_SYSTEM.md` names the target feel (Stripe/Linear/Vercel/Notion/Fiori) and lists UI principles (whitespace, card layout, soft shadow, etc.) but stops short of checkable rules. This document adds the missing layer:

| Principle (`DESIGN_SYSTEM.md`) | Concrete Rule |
|---|---|
| Banyak whitespace | Minimum 24px section padding, 16px card padding, never two data elements touching without at least 8px gap |
| Card-based layout | All grouped content lives in a `Card` primitive with consistent radius/shadow tokens (defined in `37_COMPONENT_LIBRARY.md`) — no ungrouped floating content on data pages |
| Clear hierarchy | Max 3 heading levels per page (`PageHeader` title → section heading → field label); body text never exceeds page title in visual weight |
| Data table nyaman dibaca | Row height ≥ 44px (touch-friendly, readable), zebra striping optional but consistent per table instance, numeric columns right-aligned |
| Chart tidak berlebihan | Max 2 chart types per dashboard section; no 3D effects, no more than 6 series colors before falling back to a "top N + other" grouping |
| CTA jelas | Exactly one primary-styled button per view/section; secondary actions use outline/ghost style — never two competing primary buttons |
| Empty state informatif | Every empty state follows the `UX_ONBOARDING_GUIDE.md` pattern: title, one-sentence description, single clear CTA — never a bare "No data" |

## 2. Design Tokens (missing from `DESIGN_SYSTEM.md`, defined here)

- **Color**: a neutral gray scale (backgrounds/borders/text) + one brand primary + semantic colors (success/warning/error/info) — margin/profit visuals reuse the semantic scale, never ad hoc greens/reds per chart.
- **Spacing scale**: 4px base unit (4/8/12/16/24/32/48/64).
- **Typography scale**: a single type family, 6-step scale (e.g., 12/14/16/20/24/32px), consistent line-height ratios.
- **Radius**: 2-step (small for inputs/buttons, large for cards) — "rounded corners" per `DESIGN_SYSTEM.md`, made concrete.
- **Shadow**: 2-step (resting card shadow, elevated/hover shadow) — "soft shadow" made concrete.
- Exact hex/px values are a design-tool artifact (Figma tokens) to be produced alongside implementation, not hardcoded in this document — this section defines the *structure* of the token system so engineering and design stay in lockstep.

## 3. Component-First Discipline

Every screen is composed from the reusable component list in `37_COMPONENT_LIBRARY.md` — no page-specific one-off styled elements for things a shared component already covers (directly enforces `AGENTS.md`'s "follow reusable component architecture").

## 4. Dark Mode

- Not explicitly required by `AGENTS.md`/`DESIGN_SYSTEM.md`, but strongly recommended given the Linear/Vercel reference points (both dark-mode-native products) and enterprise dashboard usage patterns (often viewed in low-light ops/finance rooms). Treated as a should-have for MVP, not a blocker — token system above is structured to support it (semantic tokens, not hardcoded colors) even if dark theme values ship in a fast-follow.

## 5. Motion

- Framer Motion (per `AGENTS.md` stack) used sparingly: page-transition fades (150-200ms), list-item enter/exit, and loading-skeleton shimmer. Never decorative motion that delays a user from reaching data — this is a finance tool, not a marketing site.
