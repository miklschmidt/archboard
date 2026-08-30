---
id: TASK-144.03
title: Expose TASK-140 tokens as a Tailwind semantic theme
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 23:23'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/theme
parent_task_id: TASK-144
priority: high
type: task
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose completed TASK-140 tokens as the canonical Tailwind semantic theme while preserving reset ownership. Delegation profile: gpt-5.6-sol, high because this is an application-wide visual contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 app.css places all @import rules first: Tailwind theme/utilities and then the existing shell stylesheet, before any declaration or @theme block; Tailwind preflight/base reset is not imported.
- [ ] #2 @theme maps the exact operator-shell color, typography, radius, spacing, elevation, state, and motion tokens without adding a second palette or replacing Excalidraw variables.
- [ ] #3 Static compile fixtures prove named utilities are emitted and unknown token names are absent; they do not claim rendered equivalence.
- [ ] #4 Theme changes preserve light/dark/high-contrast/reduced-motion contracts and defer rendered shell equivalence to TASK-144.14 browser coverage.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.01 finalized at integration HEAD a098684. This leaf owns only the application-wide semantic Tailwind theme and static compile fixtures; Vite configuration and rendered-shell equivalence remain protected.
<!-- SECTION:NOTES:END -->
