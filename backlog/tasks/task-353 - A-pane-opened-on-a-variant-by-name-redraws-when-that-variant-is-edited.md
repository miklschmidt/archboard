---
id: TASK-353
title: A pane opened on a variant by name redraws when that variant is edited
status: To Do
assignee: []
created_date: '2026-09-28 01:50'
labels:
  - ui
dependencies: []
priority: medium
type: bug
ordinal: 594000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 while filming README footage (TASK-352's session). A pane opened on board@<variant name> (for example Archboard@Queued writes, by URL or by archboard browser show) receives the board_note for an edit of that variant and reads the document again, but its stage keeps the old data-version and the old picture (reproduced 3 of 3). The same pane addressed by variant id (archboard@BzxD0ZBL) redraws at once, and a pane on the current variant always redraws. An agent that shows its proposal by name and then edits it leaves the user looking at a stale picture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pane opened on board@<variant name> draws the new version when an agent edits that variant
- [ ] #2 A pane opened by variant id and a pane on the current variant keep redrawing as they do now
<!-- AC:END -->
