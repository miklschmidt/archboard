---
id: TASK-061
title: A board note is written without being made atomic
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/repo-registry.ts
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server.

src/server.ts around 2690 writes a board note with a bare writeFileSync. A crash, a full disk or a process killed mid-write leaves a truncated note.

Truncation fails loudly on the next read, which is the good half: cutting a real note at 10, 50, 95 and 99.9 percent all throw "No Drawing block found" rather than loading a partial board. The bad half is that the board is then gone, and the note is the only copy once it has been saved.

src/core/repo-registry.ts around 116 already writes atomically with a temp file and a rename, so the pattern exists in this codebase and is not being used for the thing that matters most.

The investigating agent tried to measure the race window with a two-process stat probe and saw zero torn reads in 8.4 million attempts for both the plain and the rename versions. They were explicit that this proves nothing about the hazard, only that it is narrow, and reported it from the mechanism instead. That is the right reading: rename is atomic by contract, writeFileSync is not, and a vault is a directory other programs watch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board note is written by rename, so a reader sees the old note or the new one and never a partial
- [ ] #2 The same holds for every writer of a vault note
<!-- AC:END -->
