---
id: TASK-048
title: A snapshot shares element objects with the board it was taken from
status: To Do
assignee: []
created_date: '2026-08-20 04:01'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/board-store.ts
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-042 agent, which fixed the same hazard one layer down and named this one rather than widening its scope.

POST /api/snapshots builds a Snapshot with elements: Array.from(board.elements.values()), so the snapshot holds the same objects as the live board. Editing the board in place would edit the snapshot taken to protect against exactly that.

Nothing fails today, for the same unwritten reason TASK-042 removed elsewhere: updates replace objects rather than mutating them, and restore goes back through batch-create and builds fresh objects. That invariant is not written down and not tested, and a snapshot is the one thing whose whole job is to be a copy.

TASK-042 put the deep copy in replaceBoardElements in src/core/board-store.ts and used structuredClone, because the parts worth protecting are nested: customData is the semantic channel (ADR 0003) and boundElements is how a label belongs to its container, so a shallow spread leaves exactly those shared. The same reasoning applies here, and the same helper may fit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A snapshot shares no element objects with the board it was taken from, nested fields included
- [ ] #2 A check mutates a board in place after snapshotting and shows the snapshot unchanged
<!-- AC:END -->
