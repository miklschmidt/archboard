---
id: TASK-092
title: Prove a save-as refreshes a pane holding the destination
status: To Do
assignee: []
created_date: '2026-08-22 15:40'
updated_date: '2026-08-28 00:35'
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
- [ ] #1 A check opens a pane on the destination, saves a different source to that address, and proves the destination pane receives the exact created, updated, and deleted replacement through elements_changed.
- [ ] #2 The source pane is not repointed and ADR 0012 remains unchanged; a save still does not choose what a source pane shows.
- [ ] #3 The check uses the centralized write notification path. No special variant-swap route or second pane-refresh mechanism is added.
<!-- AC:END -->
