---
id: TASK-092
title: Prove a save-as refreshes a pane holding the destination
status: Done
assignee:
  - '@codex'
created_date: '2026-08-22 15:40'
updated_date: '2026-08-28 02:05'
labels: []
dependencies: []
references:
  - scripts/check-boards.mjs
  - src/runtime/engine/board-write.ts
  - docs/adr/0012-a-save-writes-a-file-and-does-not-move-a-pane.md
  - docs/adr/0016-one-writer-at-a-time-per-board.md
priority: medium
type: bug
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The hidden variant-swap workflow that motivated this task was later rejected by ADR 0016. The production write path has also changed: writeBoard now diffs the saved document against the destination and sends elements_changed to panes holding that destination. The stale-pane bug therefore appears fixed as a consequence of the single write path.

Keep one narrow regression proof, then close the task. A socket pane holds the destination, a different source is saved over that destination, and the pane must receive the exact replacement through the ordinary write message. Preserve ADR 0012: source panes do not move, and board save does not become a screen-navigation command. No production change is expected unless the proof fails.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A check opens a pane on the destination, saves a different source to that address, and proves the destination pane receives the exact created, updated, and deleted replacement through elements_changed.
- [x] #2 The source pane is not repointed and ADR 0012 remains unchanged; a save still does not choose what a source pane shows.
- [x] #3 The check uses the centralized write notification path. No special variant-swap route or second pane-refresh mechanism is added.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing save-as section in scripts/check-boards.mjs with two socket panes: one remains on a source board and one holds an already-populated destination board. Seed the documents so the replacement has one source-only element, one same-ID element with changed fields, and one destination-only element.
2. Save the source over the destination through POST /api/boards/save, then inspect the destination pane's next ordinary elements_changed message. Assert its created and updated elements exactly match the persisted destination document for those IDs, its deleted list is exactly the destination-only ID, and no second refresh mechanism or production route is involved.
3. Assert the source pane receives no board switch and still reports the source board after the save, preserving ADR 0012. If the wire proof fails, stop and report the production finding before editing board-write behavior.
4. Validate through bun run test:boards only; no browser run is needed because this contract is HTTP plus WebSocket pane delivery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added the approved WebSocket regression proof in scripts/check-boards.mjs. A source pane and an already-populated destination pane receive a save-as whose fixed-ID fixture produces exactly created=[created], updated=[same], and deleted=[deleted]. The destination receives that exact persisted replacement through elements_changed while the source pane stays on save-source and no pane moves. test:boards passes, so no production board-write file was changed.

Independent-review remediation: the source-pane no-switch assertion now crosses the source socket through the existing correlated viewport request after the save, with no fixed delay. It then reads GET /api/panes and proves p-one authoritatively remains on save-source while p-two remains on save-destination. The exact created/updated/deleted elements_changed proof remains unchanged and passes.

Final verification: independent fixed-range rereview found no Standards or Spec findings. The integrated main checkout passed bun run test:boards with the exact destination delta, source-socket barrier, and authoritative pane-state assertions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a focused save-as regression proving the destination pane receives exact created, updated, and deleted elements through the ordinary elements_changed path while the source pane stays put. No production route or second refresh mechanism was added. Verified with test:boards and an independent clean review.
<!-- SECTION:FINAL_SUMMARY:END -->
