---
id: TASK-144.09
title: Document the Archboard UI aesthetic contract
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-144.03
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
Own docs/design/archboard-ui-aesthetics.md before any semantic shell integration. Convert the merged TASK-140 reference into durable rules future UI workers can apply without treating framework defaults as visual direction. Delegation profile: gpt-5.6-sol, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The guide names the TASK-140 reference/mockup as authority and documents canvas-first proportions, Swiss grid, typography, flat rules, small radii, cobalt/lime, restrained motion, and themes.
- [ ] #2 It forbids generic bubbles/cards/gradients/glow/decorative shadows/mock data/framework defaults while distinguishing illustrative reference content from product state.
- [ ] #3 It requires named modules, semantic utilities, native formatting/lint, accessibility, rendered inspection, and one behavior/state owner.
- [ ] #4 This guide is a dependency of shell integration and future-agent enforcement; it does not claim that later rendered work already conforms.
<!-- AC:END -->
