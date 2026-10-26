---
id: TASK-549.13
title: Explain the captured reading through local agent actions
status: To Do
assignee: []
created_date: '2026-10-26T05:25:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.06
  - TASK-549.12
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 943000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 13.

## What to build

Agent explanations must describe the reading that the user selected when the request began.

Toolbar, context-menu, keyboard, and voice actions explain selections, relationships, flows, and proposals through the same local workhorse contract.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.06, TASK-549.12
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Toolbar, context-menu, keyboard, and voice actions explain selections, relationships, flows, and proposals through the same local workhorse contract.
- [ ] #2 Each request captures its model, revision, identities, reading, and action at invocation. Later navigation never retargets it.
- [ ] #3 The interface and voice use one textual answer. Unavailable agents, progress, failure, and retry remain visible. Missing-flow requests can trigger investigation.
- [ ] #4 Answers remain temporary until an explicit agent edit records them through normal claims and stale-write protection.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
