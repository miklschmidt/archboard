---
id: DRAFT-001
title: Establish the Tailwind and Base UI foundation
status: To Do
assignee: []
created_date: '2026-08-30 11:55'
labels: []
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
parent_task_id: TASK-140
priority: high
type: enhancement
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the smallest shared styling and interaction foundation needed by the operator shell and later workbench. Tailwind remains additive beside the current shell and Excalidraw styles. shadcn distributes reviewed Base UI source into named Archboard UI modules rather than creating a generic component bucket or a second application state model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exact compatible Tailwind 4 and Vite plugin versions are pinned, one canonical UI stylesheet compiles them once, and the initial integration preserves the existing reset instead of enabling Preflight without rendered evidence
- [ ] #2 components.json selects Base UI, CSS variables, the canonical stylesheet, and aliases that satisfy the module boundary rules; one interaction-heavy component is copied, reduced to the needed behavior, and exposed through a named UI module root
- [ ] #3 One semantic token map expresses the operator reference colors, typography roles, spacing, radii, rules, focus, light theme, and dark theme without gradients, glow, rounded dashboard cards, or duplicate color constants
- [ ] #4 Oxfmt sorts complete static Tailwind class names deterministically, and an Oxlint rule or repository-policy test rejects the stable invalid class construction patterns that formatting cannot cover
- [ ] #5 A concise operator-shell aesthetic guide is linked from the instructions future UI workers read and names the reference mockup as visual authority
- [ ] #6 Type checks, lint, formatting fixtures, a production build, and rendered browser checks prove the migrated Base UI component, both themes, the 420 pixel layout, and unchanged Excalidraw controls
<!-- AC:END -->
