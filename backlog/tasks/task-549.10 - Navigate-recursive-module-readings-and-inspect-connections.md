---
id: TASK-549.10
title: Navigate recursive module readings and inspect connections
status: To Do
assignee: []
created_date: '2026-10-26T05:25:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.01
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 940000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 10.

## What to build

Readers need recursive exploration without authored boards or fixed levels for each scope.

A reader opens root modules, drills into immediate children, and returns through breadcrumbs or browser Back and Forward.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.01
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reader opens root modules, drills into immediate children, and returns through breadcrumbs or browser Back and Forward.
- [ ] #2 Show direct callers and outgoing targets as nearby context. Derive interfaces before filters, and retain whole-module endpoints without inventing internal targets.
- [ ] #3 Project and aggregate connections by visible endpoints and kind. Inspection reveals every underlying relationship and distinct label in deterministic order.
- [ ] #4 Reuse client rendering. Reject obsolete layout results by reading and revision. Camera changes remain immediate, and missing subjects produce explicit partial readings.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
