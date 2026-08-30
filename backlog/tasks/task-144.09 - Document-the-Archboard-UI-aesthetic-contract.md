---
id: TASK-144.09
title: Document the Archboard UI aesthetic contract
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:43'
labels: []
dependencies:
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - docs/design/archboard-ui-aesthetics.md
parent_task_id: TASK-144
priority: high
type: task
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own `docs/design/archboard-ui-aesthetics.md` and its durable agent-facing links. Convert the merged TASK-140 reference into concise rules future UI workers can apply with Tailwind and Base UI without treating framework defaults as visual direction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/design/archboard-ui-aesthetics.md names the TASK-140 reference/mockup as authority and documents canvas-first desktop proportions, Swiss grid, Onest/DM Mono, flat rules, small radii, cobalt/lime, restrained motion, and both themes.
- [ ] #2 It forbids generic chat bubbles, rounded dashboard cards, gradients, glow, decorative shadows, mock data, and shadcn/Base UI defaults while distinguishing illustrative reference content from product state.
- [ ] #3 It requires named UI module boundaries, semantic utilities, native Oxfmt sorting, existing strict native Oxlint, accessibility, rendered inspection, and one behavior/state owner.
- [ ] #4 This leaf owns only the guide; TASK-144.12 owns the exact future-UI-worker requirement in AGENTS.md without copying changing framework defaults.
<!-- AC:END -->
