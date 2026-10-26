---
id: TASK-549.18
title: Export and import a complete portable model
status: To Do
assignee: []
created_date: '2026-10-26T05:26:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.08
  - TASK-549.14
  - TASK-549.17
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 948000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 18.

## What to build

A portable model needs its referenced history as well as its current JSON inputs.

An owner exports current inputs and required history, then imports them into a fresh location. Modules, proposals, decisions, and walkthroughs remain usable.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.08, TASK-549.14, TASK-549.17
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner exports current inputs and required history, then imports them into a fresh location. Modules, proposals, decisions, and walkthroughs remain usable.
- [ ] #2 Include every referenced baseline and checkpoint, including private archives. Preserve identities and refuse incomplete bundles before exposing an imported model.
- [ ] #3 Import uses the existing installation contract. A restored bundle can supply lost local history without claiming that archive deletion is impossible.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
