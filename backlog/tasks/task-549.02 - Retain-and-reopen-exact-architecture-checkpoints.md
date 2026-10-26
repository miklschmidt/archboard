---
id: TASK-549.02
title: Retain and reopen exact architecture checkpoints
status: To Do
assignee: []
created_date: '2026-10-26T05:24:00Z'
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
ordinal: 932000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 2.

## What to build

Historical readings need retained architecture inputs that survive changes to the code branch.

An agent retains an architecture reading locally. CLI and browser readers reopen it after current files change. Historical reads never mix in current content.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.01
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent retains an architecture reading locally. CLI and browser readers reopen it after current files change. Historical reads never mix in current content.
- [ ] #2 Preserve required inputs through Git ancestry or retention refs. Honor configured identity and signing without changing the user index, HEAD, or checkout.
- [ ] #3 Concurrent archive appends preserve both checkpoints through marked synchronization commits. Archive order never selects current architecture or merges architectural meaning.
- [ ] #4 Linked worktrees share archive objects and refs. Exact reads identify missing architecture or source evidence and provide a recovery action.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
