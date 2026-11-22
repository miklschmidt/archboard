---
id: TASK-670
title: A history record from a newer Archboard says so, and says what to do
status: To Do
assignee: []
created_date: '2026-11-22T16:20:00Z'
labels:
  - bug
dependencies: []
ordinal: 1163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a newer Archboard writes a record into the local archboard-history branch (for example the upgrade installation record with inventoryDigest), older code fails every model read with a raw schema dump and "Restore the local archive or explicitly fetch the named archboard-history branch from its owner, then retry the exact checkpoint" (packages/model/src/runtime/canonical/history/retained-reading/operations/result.ts:110). That advice is wrong: nothing is lost; the vault was upgraded by a newer Archboard. The history branch is shared by every checkout of a repository on a machine, so this reaches checkouts the upgrade never touched. Owner, 2026-11-22: "Fix the message. No history roll back."
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A history record that this Archboard cannot read because a newer one wrote it is refused with a message that says the vault was upgraded by a newer Archboard, names what it found, and says to update Archboard
- [ ] #2 The raw schema dump is not shown to the reader
- [ ] #3 A record that is malformed rather than newer keeps a message that says it is damaged and how to recover
- [ ] #4 A test covers both cases
<!-- AC:END -->
