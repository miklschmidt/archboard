---
id: TASK-549.09
title: Correct historical architecture with an audit trail
status: To Do
assignee: []
created_date: '2026-10-26T05:25:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.08
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 9.

## What to build

Historical factual errors need explicit corrections that preserve the original record.

An agent explicitly corrects a historical or shelved state with a reason and source references. Readers see the correction through its lasting state identity.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.08
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent explicitly corrects a historical or shelved state with a reason and source references. Readers see the correction through its lasting state identity.
- [ ] #2 The original checkpoint remains exact and readable. Ordinary edits to historical states still fail. Comparisons expose the correction and its audit trail.
- [ ] #3 Following local drafts reconcile against the correction. Adopted successors and unrelated current states remain unchanged.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
