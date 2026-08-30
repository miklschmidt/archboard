---
id: TASK-144.07
title: Copy reduced Base UI dialog and button modules
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-144.04
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/dialog
  - src/ui/button
parent_task_id: TASK-144
priority: high
type: task
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copy and reduce the hash-gated Base UI dialog and its button dependency into named Archboard modules. Delegation profile: gpt-5.6-sol, high because component accessibility and visual API are application-wide.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Local dialog and button preserve Base UI roles, labels, focus restoration, Escape, portal, outside-dismissal, disabled state, and ref behavior while exposing a small Archboard-owned API.
- [ ] #2 Generated default colors, radius, shadows, animation, icon package, cva, demo variants, and unused helpers are removed; semantic Tailwind tokens and ui-classnames are the only style composition path.
- [ ] #3 Module tests prove exported API, prop/type contracts, deterministic classes, and pure controlled/open-state behavior only; browser interaction/a11y belongs to TASK-144.11.
- [ ] #4 Provenance comments record registry URLs, both approved hashes, reduction date, and local ownership without implying future generated code is trusted.
<!-- AC:END -->
