---
id: TASK-067
title: Build the board mutex as a deep module
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 20:02'
updated_date: '2026-08-21 13:56'
labels: []
dependencies:
  - TASK-066
  - TASK-068
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
- [ ] #8 Taking the lock at the start of a human gesture works, given that the change report is a trailing debounce that sends nothing until 400 ms after the finger lifts
- [ ] #9 A pane that cannot hear the lock broadcast, because its socket has dropped, does not let a human draw on a board somebody else holds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/board-lock.ts: one deep module. Interface is `withBoardLock(request, run)` — ask to write a board, either the write runs or BoardHeldError names the holder and how long it has been held. Behind it: a lease file in <vault>/.archboard/locks/<key>.lock, atomic wx-create, rename-with-token-readback to steal an expired one, expiry, renewal, reentrancy by holder id (join vs create; release only what you created), the wait up to LOCK_WAIT_CAP_MS, and the broadcast sink.
2. A check that spawns two processes over one vault and shows them excluding each other, plus lease expiry, reentrancy and the steal race, all through the interface.
3. Server: one Express middleware over the mutating routes, derived from the persistBoard/writeBoardContent call sites and deny-by-default for any non-GET naming a board. Routes that await a browser round trip stay out — their write arrives later as a change report and is locked then. New POST /api/boards/hold and /api/boards/hold/release for the human's gesture. Lock take/release broadcasts board_lock to every pane.
4. Frontend: a cheap scene stamp (count plus version sum) inside scheduleReport gives the leading edge the trailing debounce cannot; the pane holds from the first real change, re-arms every LOCK_RENEW_MS, releases once the report has landed and nothing new arrived. viewModeEnabled = !connected || heldByAnother — a pane that cannot hear the broadcast assumes the board is held. A refused claim reloads the board rather than keeping an edit nobody will accept.
5. Wire the check into package.json and check-ci-suites. Revert-proof each piece and count the failures.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:12
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: stands, with two corrections to the design it assumes and one piece of
scope split out. Sequencing confirmed and now recorded as dependencies.

CORRECTION 1, and it is load-bearing. This task and ADR 0016 both say the first
change of a gesture takes the lock. Nothing reaches the server at the first
change. `scheduleReport` at `frontend/src/canvas/useCanvasSession.ts:390` is a
400 ms trailing debounce, cleared and restarted on every change, with no
maximum wait, so a continuous drag posts nothing until 400 ms after the finger
lifts. The nearest immediate signal is the selection publish on a 150 ms
debounce, which is a different route and does not fire for every gesture. So
taking the lock at first change needs a new, cheap, immediate message from the
pane, and that message is part of this module's interface rather than something
to discover halfway through building it.

CORRECTION 2. Lock state is broadcast over the socket, and change reports are
deliberately not gated on the socket. The comment at
`useCanvasSession.ts:391-392` says why: "reporting is an HTTP call, so a dropped
socket must not also stop a human's edits reaching the server". So a pane whose
socket has dropped never hears that the board is held, keeps letting the human
draw, and posts a write that is refused. That is precisely the yank ADR 0016
exists to prevent, arriving by a different route. The claim has to fail closed:
a pane that cannot hear about the lock must not believe the board is free.

SCOPE SPLIT. ADR 0016 gained a section after this task was filed: an agent may
claim a board for longer than one write, with a time to live, renewal, human
revocation, and a pane that says who holds it and why. None of that is in this
task's seven acceptance criteria and it is a different amount of work from the
per-write lock. It has been filed separately and depends on this. This task
stays the per-write mutex, which is the thing everything else needs.

SEQUENCING. Two dependencies, both now recorded:

- The batching task, for the reason the description already gives: while align
  and distribute issue one write per element, each would take and release the
  lock separately.
- TASK-066, because the lease, the renewal interval and the wait cap are exactly
  the constants that module is being created to hold, and defining them here
  would recreate the scattering.

And one ordering that is NOT a dependency, checked rather than assumed. The echo
does not need the lock. `docs/design/server-is-the-truth.md` section 6 measured
a drag surviving 70 writes to another element and 40 to itself, and a text
editor surviving 18 full-document applies. So the stage that makes a write
return the document can ship before this one.
---
<!-- COMMENTS:END -->
