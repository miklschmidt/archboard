---
id: TASK-549.15
title: Follow code bindings and cross-model references
status: To Do
assignee: []
created_date: '2026-10-26T05:25:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.04
  - TASK-549.10
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 945000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 15.

## What to build

Architecture ownership must remain separate from code location and navigation into another model.

Readers open code and follow explicit references into another model without changing architectural ownership. Existing checkout selection still resolves code bindings.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.04, TASK-549.10
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Readers open code and follow explicit references into another model without changing architectural ownership. Existing checkout selection still resolves code bindings.
- [ ] #2 A cross-model reference names its model, subject, and state. Historical readings pin foreign revisions and never substitute current content.
- [ ] #3 CLI and browser readers expose unavailable models or source evidence. No operation silently transfers ownership or writes across two models.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
