---
id: TASK-067
title: Build the board mutex as a deep module
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:02'
updated_date: '2026-08-21 14:58'
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
- [x] #1 One interface: ask to write a board, and either write it or learn who holds it
- [x] #2 A holder that dies has its lease expire rather than wedging the board
- [x] #3 A human gesture holds the lock and releases it after the flush settles
- [x] #4 An agent blocked by a human waits, then names the holder and how long it has been held
- [x] #5 A pane whose board is locked elsewhere disables interaction before the touch
- [x] #6 Two canvas servers over one vault exclude each other, shown by a check
- [x] #7 Nothing outside the module touches the lock file or the broadcast
- [x] #8 Taking the lock at the start of a human gesture works, given that the change report is a trailing debounce that sends nothing until 400 ms after the finger lifts
- [x] #9 A pane that cannot hear the lock broadcast, because its socket has dropped, does not let a human draw on a board somebody else holds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/board-lock.ts: one deep module. Interface is `withBoardLock(request, run)` — ask to write a board, either the write runs or BoardHeldError names the holder and how long it has been held. Behind it: a lease file in <vault>/.archboard/locks/<key>.lock, atomic wx-create, rename-with-token-readback to steal an expired one, expiry, renewal, reentrancy by holder id (join vs create; release only what you created), the wait up to LOCK_WAIT_CAP_MS, and the broadcast sink.
2. A check that spawns two processes over one vault and shows them excluding each other, plus lease expiry, reentrancy and the steal race, all through the interface.
3. Server: one Express middleware over the mutating routes, derived from the persistBoard/writeBoardContent call sites and deny-by-default for any non-GET naming a board. Routes that await a browser round trip stay out — their write arrives later as a change report and is locked then. New POST /api/boards/hold and /api/boards/hold/release for the human's gesture. Lock take/release broadcasts board_lock to every pane.
4. Frontend: a cheap scene stamp (count plus version sum) inside scheduleReport gives the leading edge the trailing debounce cannot; the pane holds from the first real change, re-arms every LOCK_RENEW_MS, releases once the report has landed and nothing new arrived. viewModeEnabled = !connected || heldByAnother — a pane that cannot hear the broadcast assumes the board is held. A refused claim reloads the board rather than keeping an edit nobody will accept.
5. Wire the check into package.json and check-ci-suites. Revert-proof each piece and count the failures.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as one module, src/core/board-lock.ts. The interface is withBoardLock(request, write): it writes, or throws BoardHeldError naming the holder and how long they have had the board. holdBoard/releaseHold are the same lock asked the other question — a person's hold spans requests — and are called by the two routes that serve a gesture and by nothing else. Waiting, renewing, expiring a dead holder, the free-linger and the broadcast sink all sit behind those.

The lease is a JSON file at <vault>/.archboard/locks/<key>.lock. Taking a lock that is not there is an exclusive create and settles itself; taking over one whose holder died is a rename plus a read-back after a guard, because two processes can both decide a lease lapsed. Reads never lock. A lock file that cannot be parsed reads as nobody holding the board, so a corrupt file cannot wedge one.

One express middleware puts every board-changing request through it, deny by default, with an exemption table naming a reason per entry. from-mermaid is exempt because it waits on the pane whose change report IS the write — holding the board across that wait would deadlock until the lease lapsed.

The leading edge the task's correction 1 asked for: POST /api/boards/hold, sent by the pane on the first change of a gesture, renewed every LOCK_RENEW_MS while the hand moves, released once the report has landed and nothing is queued. A fold over every field a hand can change decides what counts as a change. The hold waits REPORT_DEBOUNCE_MS rather than not at all: an agent's write is about 20 ms and a hand that landed inside one has not lost the board.

Correction 2, fail closed: readOnly = !connected || heldByOther, and heldBy starts as an unknown holder until the server says otherwise. The server sends the lock state immediately behind every board it hands a pane, on connect and on switch.

A real bug came out of this, and it was not a test artefact. scheduleReport counted every onChange as an edit by the human. Once the lock started toggling the pane in and out of read-only, an agent's write read as two human edits, handMoved was true during the round trip of the human's own report, and the resync that answers it was skipped — so the pane kept a document one write behind, missing the boundElements entry the agent's new arrow had added to the shapes it joins. A wall display with an agent drawing beside a person hits that. check-live-session named the element and the field.

VERIFICATION. `bun run test` green end to end on the final tree, 23 suites. `bun run test:lock` is 61 checks, including two canvas servers over one vault: one holds through its own route, the other refuses an element write with 409 BOARD_HELD naming a holder it has never heard of, and lets it through once the hold is given back. `bun run test:live-session` gained five: the pane accepts a touch on a free board, refuses one the moment somebody else takes it, takes it back when they are done, assumes the board is held once the canvas is killed under it, and — through a release that answers `released: true` — proves a real gesture had taken the board before its report went out.

REVERT-PROOFS. Each line put back wrong, then the suite counted:
  the lease never expires (a dead holder keeps the board)        1 check
  the lock lives in the process rather than the vault            7 checks
  a write releases a hold it only joined                         3 checks
  a release is broadcast with no linger                          1 check (15 changes of read-only state across 16 messages)
  nothing takes the lock in front of a route                     4 checks
  the panes are never told                                       5 checks
  every onChange counts as a human edit                          2 checks in live-session, the boundElements divergence
  the pane's read-only gate disabled                             2 checks in live-session, both halves of the touch gate

Three of those counted one failure and then died, because a take meant to succeed threw and took the rest of the file with it. check-lock catches them now, which is what took the lock-file-in-the-process break from 1 to 7. Two more were passing for the wrong reason: a lease that never expires threw rather than failing, and the fan-out ran as microtasks so every timer fired after the loop, which made a linger of nought indistinguishable from a linger of a second.
<!-- SECTION:NOTES:END -->

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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A board has a mutex, and the interface is one call: withBoardLock({board, holder}, write) either writes the board or throws BoardHeldError naming the holder and how long they have had it. Waiting, renewing, expiring a dead holder, coalescing releases and telling the panes sit behind it (src/core/board-lock.ts).

The lease is a file under <vault>/.archboard/locks/, not a flag in a process, because more than one canvas may serve one vault. One express middleware puts every board-changing request through it, deny by default, with an exemption table naming a reason per entry; routes that wait on the browser stay out, since from-mermaid's write arrives afterwards as the converting pane's own change report and that report is locked.

A person's hold is a gesture. Nothing reached the server at the start of one, so the pane got a message that does: POST /api/boards/hold on the leading edge of the first change, renewed while the hand moves, released once the report has landed. A fold over every field a hand can change separates an edit from a scroll, a zoom or a read-only toggle. An agent waits LOCK_WAIT_CAP_MS for a person; a person waits REPORT_DEBOUNCE_MS for an agent, because a hand that landed inside a 20 ms write has not lost the board.

The lock broadcasts as well as guards: board_lock reaches every pane holding the board, and a pane that is not the holder goes into Excalidraw's view mode so the touch never happens. That gate fails closed on !connected, and a pane assumes an unknown holder until the server says otherwise.

Verified by bun run test green end to end; test:lock is 61 checks including two canvas servers over one vault, and test:live-session gained five browser assertions covering the read-only gate, the socket-drop fail-closed and the gesture's hold. Every mechanism was reverted and the failures counted: 1, 7, 3, 1, 4, 5 in test:lock and 2 twice in test:live-session.

ADR 0016 amended with what was not built: a second canvas's panes learn a board is held at the write rather than before the touch, because nothing polls the lock directory. Deferred to TASK-080, where a claim running for minutes makes the poll worth its cost.
<!-- SECTION:FINAL_SUMMARY:END -->
