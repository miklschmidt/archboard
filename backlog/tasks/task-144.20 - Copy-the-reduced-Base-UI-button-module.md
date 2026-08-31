---
id: TASK-144.20
title: Copy the reduced Base UI button module
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 17:51'
updated_date: '2026-08-31 04:02'
labels: []
dependencies:
  - TASK-144.04
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/button
parent_task_id: TASK-144
priority: high
type: task
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copy and reduce only the pinned Base UI button fixture into one named Archboard deep module. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The local button preserves Base UI button semantics, disabled/ref behavior, keyboard/pointer activation, and a small Archboard-owned API.
- [ ] #2 Generated default aesthetics, icon package, cva, demo variants, and unused helpers are removed; semantic tokens and ui-classnames are the sole class path.
- [ ] #3 Module tests prove exported API, prop/types, deterministic classes, and pure disabled/state behavior; rendered interaction belongs to TASK-144.11.
- [ ] #4 Provenance records the immutable commit, button hash, reduction date, and local ownership.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.04 finalized at integration HEAD 9d8ecb87926a967c6984fe7b4267d85a04822f2d. This leaf owns src/ui/button and its focused module/policy evidence. It must reduce only the pinned reviewed button fixture, preserve Base UI semantics through an Archboard-owned API, use semantic tokens plus ui-classnames as the sole class path, and remain disjoint from active assistant-ui and app-server epoch lanes.
<!-- SECTION:NOTES:END -->
