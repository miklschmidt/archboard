---
id: TASK-063
title: BoardState.note is written and never read
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/board-store.ts
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server.

src/server.ts writes BoardState.note at around 2511 and 2707 and nothing reads it. The save re-reads the destination itself at around 2636, which is what makes the field redundant rather than merely unused.

It holds the full text of the note, so an open board carries a 19 to 55 KB copy of a string nobody consults. Three boards open is roughly 150 KB of nothing, which does not matter on its own and does matter as a signal: it looks like a cache that a reader is relying on, so the next person to touch the save path has to work out that it is not.

Delete it, or make the save use it and drop the re-read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 BoardState.note is gone, or it is what the save reads instead of re-reading the file
<!-- AC:END -->
