---
id: TASK-353
title: A pane opened on a variant by name redraws when that variant is edited
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 01:50'
updated_date: '2026-10-11 14:05'
labels:
  - ui
dependencies: []
priority: medium
type: bug
ordinal: 594000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 while filming README footage. In a scratch copy of the dogfood vault, a proposal 'Queued writes' was branched from Archboard for the capture (it exists in no tracked vault). A pane opened on board@<variant name> (Archboard@Queued writes, by URL or by archboard browser show) receives the board_note for an edit of that variant and reads the document again, but its stage keeps the old data-version and the old picture (reproduced 3 of 3). The same pane addressed by variant id (archboard@BzxD0ZBL in that scratch vault) redraws at once, and a pane on the current variant always redraws. To reproduce with a tracked vault, branch a proposal in a scratch copy of examples/web-shop, open it by name, and edit it. An agent that shows its proposal by name and then edits it leaves the user looking at a stale picture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pane opened on board@<variant name> draws the new version when an agent edits that variant
- [x] #2 A pane opened by variant id and a pane on the current variant keep redrawing as they do now
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause (found by a failing stage test with the page's own picture source, red 1 of 3 for the by-name case only): readBoardAgain cancelled the board's reads, then invalidated the picture and the document keys in parallel with the default cancelRefetch: true. The invalidation of the document key cancelled the document read that the by-name pane's picture had just started, so its redraw died and nothing drew it ahead (draw-ahead covers the bare board and variants by id only). Panes on the current variant or on a variant id looked fine because draw-ahead put their pictures in the cache. Fix: invalidate with cancelRefetch: false; a read that starts after the cancelling is from after the write.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A pane opened on board@<variant name> now draws the new version when that variant is edited. The cause was in readBoardAgain: invalidating the document key cancelled the document read that the pane's own redraw had just started, and only panes on the current variant or a variant id were rescued by draw-ahead. readBoardAgain now invalidates without cancelling a read started after the write. Verified by semantic-board-variant-by-name.test.tsx, which uses the page's own picture source and edits the board under three panes (current variant, variant id, variant name): the by-name case was red before the change, and all three are green after. The 310 canvas tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
