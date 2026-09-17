---
id: TASK-260
title: Report a code binding whose path has left the repository
status: To Do
assignee: []
created_date: '2026-09-17 22:29'
labels: []
dependencies:
  - TASK-259
references:
  - src/runtime/semantic-board-store/lib/diagnostics.ts
  - TASK-257
ordinal: 467000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A node's binding is part of its meaning and is what "open the code" resolves, and nothing notices when the path stops existing. The dogfood refresh found 9 of 89 bindings naming files the renderer's move into src/transformers had taken away, a year after the fact, only because somebody went looking. Measured after the rewrite: 221 bindings across every variant, and the 5 that still name a missing path all sit on a frozen historical variant.

It belongs in the vault checker rather than at the write boundary, for the same reason the drill-down checks do: the answer depends on a filesystem the board does not own, so it is true when written and goes stale on its own. And it must not run on historical variants — a binding that named a file which existed then is a correct record, and a check that flagged it would push somebody toward rebinding history to today's files, which would make the record lie.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The vault checker warns per node when a binding names a path that is not in the repository, naming the path
- [ ] #2 The warning is not raised for a historical variant
- [ ] #3 A test owns both, and the tracked vault passes
<!-- AC:END -->
