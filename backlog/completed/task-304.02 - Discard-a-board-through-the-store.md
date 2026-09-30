---
id: TASK-304.02
title: Discard a board through the store
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 12:38'
labels:
  - cli
  - runtime
dependencies: []
parent_task_id: TASK-304
ordinal: 532000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board made only to be recorded should not stay in the vault. No path deletes a board today: semantic-board-store has only write transitions. Deleting goes through the store, like every write, so it takes the one-writer lease and is refused when somebody else holds the board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The store deletes a board note under the board's lease with a stated doing, and a board somebody else claims is refused and the holder is named
- [x] #2 A loopback route and the semantic board client expose it; a missing board is refused as missing
- [x] #3 Panes and the catalogue learn the board is gone the way they learn of any other change to the vault
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
discardSemanticBoard in semantic-board-store under the board's lease (shared underBoardLease with writes), unlink + fsync the directory, end this canvas's claim; POST /api/semantic-boards/discard through the write boundary with doing and a checked expectVersion; announce through the change feed so catalogue and panes learn it is gone; discardSemanticBoardOnCanvas client.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built by an implementer (f2b438da), review found an unchecked expectVersion (must-fix), fixed in f2bff286, merged b8994812. Owners: src/runtime/semantic-board-store/tests/discard.test.ts, tests/system/canvas-state/board-discard.test.ts. Used by semantic record --discard; exercised end to end in tests/system/canvas-state/walkthrough-recording.test.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
discardSemanticBoard deletes a board's note under its lease with a stated doing (unlink and fsync the directory), refuses a held board naming the holder and a missing board as missing, and checks a stated version; POST /api/semantic-boards/discard goes through the write boundary, and the change feed tells the catalogue and panes. semantic record --discard states the version it read before recording, so a board changed meanwhile is kept. Verified by src/runtime/semantic-board-store/tests/discard.test.ts, tests/system/canvas-state/board-discard.test.ts, the recording owners and a real-voice run that discarded its board.
<!-- SECTION:FINAL_SUMMARY:END -->
