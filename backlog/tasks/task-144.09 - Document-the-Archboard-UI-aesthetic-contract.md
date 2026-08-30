---
id: TASK-144.09
title: Document the Archboard UI aesthetic contract
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.08
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
- [ ] #1 The guide names the TASK-140 reference/mockup as authority and documents canvas-first desktop proportions, Swiss grid, Onest/DM Mono roles, flat rules, small radii, cobalt/lime semantics, restrained motion, and both themes.
- [ ] #2 It forbids generic chat bubbles, rounded dashboard cards, gradients, glow, decorative shadows, mock data, and shadcn/Base UI default aesthetics while distinguishing illustrative reference content from product state.
- [ ] #3 It requires named UI module boundaries, semantic utilities, native Oxfmt sorting, the existing strict native Oxlint baseline, accessibility verification, and real rendered inspection.
- [ ] #4 AGENTS.md and the applicable UI-worker instructions link the guide without embedding changing upstream Tailwind defaults or a custom Tailwind lint policy.
<!-- AC:END -->
