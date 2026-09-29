---
id: TASK-368.05
title: Flat dogfood module boards draw their modules as containers
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - architecture
dependencies:
  - TASK-368.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: low
type: docs
ordinal: 641000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-09-29, 9 of the 15 dogfood boards drew no container. Not every board has a module seam to draw, but the module boards that describe one `src/<area>/<module>` do.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each board without a container either draws its modules as containers through an adopted proposal, or its task notes say why it has no module seam
- [ ] #2 Relationships that crossed into another module's private file now land on that module's entry points, or the notes say why the code really does that
- [ ] #3 `./bin/dogfood check` reports no diagnostics
<!-- AC:END -->
