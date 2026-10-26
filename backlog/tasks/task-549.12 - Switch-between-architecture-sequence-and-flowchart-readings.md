---
id: TASK-549.12
title: Switch between architecture, sequence, and flowchart readings
status: To Do
assignee: []
created_date: '2026-10-26T05:25:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.05
  - TASK-549.11
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 942000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 12.

## What to build

Readers need structural and behavioral explanations without inferring execution order from dependencies.

A reader changes diagram grammar and chooses an applicable flow. Multiple matches require a choice, and missing flows remain explicit.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.05, TASK-549.11
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reader changes diagram grammar and chooses an applicable flow. Multiple matches require a choice, and missing flows remain explicit.
- [ ] #2 Behavioral readings include all required participants and steps, including those outside the prior scope. Structural filters do not remove flow messages.
- [ ] #3 Returning to architecture restores the prior reading. No selection of structural relationships invents execution order.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
