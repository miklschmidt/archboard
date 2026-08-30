---
id: TASK-144.05
title: Compose static Tailwind classes through one UI module
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.01
  - TASK-144.03
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/ui-classnames
parent_task_id: TASK-144
priority: high
type: task
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own class joining and typed variant composition in `src/ui/ui-classnames`. Add only the exact direct helpers used by this module and require complete statically detectable class strings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The public module exposes one `cn` function and only the typed variant helper actually used by accepted UI source; exact helper dependencies are pinned as direct dependencies.
- [ ] #2 Variants map exhaustively to complete class strings and never build Tailwind names by interpolation or fragmented concatenation.
- [ ] #3 Unit tests cover conflict resolution, falsy inputs, stable variant results, and consumption only through the named module entrypoint.
<!-- AC:END -->
