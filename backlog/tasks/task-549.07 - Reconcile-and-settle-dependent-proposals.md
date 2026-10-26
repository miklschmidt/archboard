---
id: TASK-549.07
title: Reconcile and settle dependent proposals
status: To Do
assignee: []
created_date: '2026-10-26T05:25:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.06
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 937000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 7.

## What to build

Dependent proposals must inherit safe changes without losing disputed work.

An agent changes a predecessor and sees safe inherited changes across following drafts. Conflicts remain visible in both CLI results and browser readings.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.06
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent changes a predecessor and sees safe inherited changes across following drafts. Conflicts remain visible in both CLI results and browser readings.
- [ ] #2 Preserve the baseline that established each conflict. Reconcile parents before children, block unsettled descendants, and publish the complete family result together.
- [ ] #3 Settlement handles competing fields, deletion against change, lost references, alternative renames, and structural ordering. Claims cover the affected descendants.
- [ ] #4 Reuse the existing semantic reconciliation cases through the public operation seam. No second transport-specific reconciliation path exists.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
