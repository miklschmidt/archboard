---
id: TASK-549.06
title: Create and compare compact proposals
status: In Progress
assignee: []
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T19:27:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.05
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 936000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 6.

## What to build

Complete proposal snapshots make small architecture changes produce large review diffs.

An agent creates a proposal spanning modules and flows. CLI and browser readers materialize and compare it from a retained baseline and identity-based changes.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.05
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent creates a proposal spanning modules and flows. CLI and browser readers materialize and compare it from a retained baseline and identity-based changes.
- [ ] #2 Support siblings, named predecessors, and planning-only models without a current state. New draft subjects remain outside current architecture until adoption.
- [ ] #3 Preserve stable state identities, names, summaries, and documents. Additions, removals, assignments, explicit clearing, and placements have distinct meanings.
- [ ] #4 Comparison defaults follow TASK-549. Unsupported predecessor changes refuse safely until reconciliation is available. Small edits store no unrelated snapshots.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
