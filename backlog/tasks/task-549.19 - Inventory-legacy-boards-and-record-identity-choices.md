---
id: TASK-549.19
title: Inventory legacy boards and record identity choices
status: To Do
assignee: []
created_date: '2026-10-26T05:26:00Z'
labels:
  - ready-for-agent
dependencies: []
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 949000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 19.

## What to build

Overlapping legacy boards contain identity choices that migration cannot safely infer.

An owner requests a read-only inventory of legacy boards, states, reconciliation bases, views, walkthroughs, aliases, and document references.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

None. This ticket can start immediately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner requests a read-only inventory of legacy boards, states, reconciliation bases, views, walkthroughs, aliases, and document references.
- [ ] #2 The inventory records a source fingerprint and an explicit mapping plan. Matching names, bindings, or drill-down links provide evidence, never automatic identity merges.
- [ ] #3 Report conflicts in definitions, parents, order, relationship ownership, and policy. Record deliberate canonical choices while preserving original identity namespaces and aliases.
- [ ] #4 This workflow changes no active architecture and needs no completed target writer.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
