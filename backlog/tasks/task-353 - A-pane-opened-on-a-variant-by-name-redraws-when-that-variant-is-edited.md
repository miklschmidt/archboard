---
id: TASK-353
title: A pane opened on a variant by name redraws when that variant is edited
status: To Do
assignee: []
created_date: '2026-09-28 01:50'
updated_date: '2026-09-28 14:48'
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
- [ ] #1 A pane opened on board@<variant name> draws the new version when an agent edits that variant
- [ ] #2 A pane opened by variant id and a pane on the current variant keep redrawing as they do now
<!-- AC:END -->
