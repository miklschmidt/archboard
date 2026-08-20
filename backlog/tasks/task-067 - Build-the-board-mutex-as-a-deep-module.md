---
id: TASK-067
title: Build the board mutex as a deep module
status: To Do
assignee: []
created_date: '2026-08-20 20:02'
labels: []
dependencies: []
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - src/server.ts
  - src/core/board.ts
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The write-exclusion half of the source-of-truth work. ADR 0016 is the decision; this is the build.

A board has a mutex. An agent takes it to write, a human takes it by touching the canvas, and nobody else writes while it is held.

The interface is one concept: ask to write a board, and either write it or be told who holds it. Everything else sits behind that. Acquiring and renewing. Expiring a holder that died. The lock file beside the note rather than in a process, because ADR 0015 makes the note the truth and two servers over one vault would not see each other's memory. Broadcasting lock state to every pane holding the board. The agent's wait cap.

A shallow lock, where each caller assembles the same four steps itself, is how the steps drift apart. That is the failure this whole line of work is about.

Three things the design has to get right, from ADR 0016:

The human's hold is a gesture, not a session. The first change takes it; it releases after the report debounce fires, the write lands, and nothing new arrives. Roughly one gesture plus 400 ms.

An agent waits rather than failing, because the expected wait is under a second. On hitting the cap it says who holds the board and since when, so a voice session has something to say.

The lock is a broadcast, not only a guard. Excalidraw applies a drag locally the moment a finger moves, so a pane whose board is locked elsewhere must disable interaction before the touch, not reject the write afterwards.

Obsidian will not respect any of it, so ADR 0006's hash check stays as the backstop for foreign writers.

Sequence after the batching work: while align and distribute still issue one write per element, every one of them would take and release the lock separately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One interface: ask to write a board, and either write it or learn who holds it
- [ ] #2 A holder that dies has its lease expire rather than wedging the board
- [ ] #3 A human gesture holds the lock and releases it after the flush settles
- [ ] #4 An agent blocked by a human waits, then names the holder and how long it has been held
- [ ] #5 A pane whose board is locked elsewhere disables interaction before the touch
- [ ] #6 Two canvas servers over one vault exclude each other, shown by a check
- [ ] #7 Nothing outside the module touches the lock file or the broadcast
<!-- AC:END -->
