---
id: TASK-549.21
title: Preserve legacy proposals and historical coverage
status: To Do
assignee: []
created_date: '2026-10-26T05:26:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.09
  - TASK-549.20
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 951000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 21.

## What to build

Independent legacy histories cannot truthfully become one historical repository state.

Extend the migration preview with drafts, baselines, standing conflicts, adoption, shelving, corrections, and lifecycle metadata.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.09, TASK-549.20
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend the migration preview with drafts, baselines, standing conflicts, adoption, shelving, corrections, and lifecycle metadata.
- [ ] #2 Readers can inspect retained original documents with their original coverage. No legacy reading borrows current surrounding modules or invents a complete historical repository model.
- [ ] #3 Convert each draft through an explicit predecessor and baseline mapping. Matching task IDs or proposal names never combine independent proposals automatically.
- [ ] #4 Planning-only boards become proposals. An immutable checkpoint retains complete originals, including unresolved data, before any later cutover.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
