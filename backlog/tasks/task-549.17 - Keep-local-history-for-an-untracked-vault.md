---
id: TASK-549.17
title: Keep local history for an untracked vault
status: To Do
assignee: []
created_date: '2026-10-26T05:26:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.03
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 947000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 17.

## What to build

Architecture work outside a source repository still needs durable local history.

An owner explicitly initializes a private bare archive for a vault outside a source repository. Existing model operations then retain and reopen its history.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.03
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner explicitly initializes a private bare archive for a vault outside a source repository. Existing model operations then retain and reopen its history.
- [ ] #2 Initialization never creates or changes a source repository. The vault remains local-only until an explicit publication destination exists.
- [ ] #3 The same signing, recovery, and diagnostic contracts apply. Published architecture contains no private machine paths.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
