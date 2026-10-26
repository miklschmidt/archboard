---
id: TASK-549.05
title: Author and render independent flow collections
status: To Do
assignee: []
created_date: '2026-10-26T05:24:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.04
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 935000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 5.

## What to build

A flow spans architectural responsibilities and cannot belong to one diagram document.

An agent creates and edits a flow spanning several modules, then renders it as a sequence or flowchart through an explicit flow selection.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.04
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent creates and edits a flow spanning several modules, then renders it as a sequence or flowchart through an explicit flow selection.
- [ ] #2 Preserve participant order, messages, decisions, loops, notes, repeat counts, and evidence. Collection filenames impose no participant ownership.
- [ ] #3 Steps retain identity across moves between flows and nested holders. Alternative renames move affected placements together. Missing holders and incompatible ordering fail explicitly.
- [ ] #4 Returns remain messages without creating reverse structural relationships. Flow reference repairs participate in the same operation and claim calculation as module edits.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
