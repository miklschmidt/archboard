---
id: TASK-055
title: board new creates the board and then reports an error
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 14:43'
updated_date: '2026-08-20 15:05'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/cli/commands/board.ts
  - src/core/panes.ts
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by running the clean test end to end.

With two panes open, `board new sandbox/payments --level service` exits with:

  Error: 2 panes are open, so this needs a pane as well as a board — --pane left | right.

That refusal is correct on its own terms: with two panes the pane cannot be guessed (ADR 0009). But the board was created anyway. Running the same command again after closing a pane answers:

  Error: Board "sandbox/payments" is already open. Switch to it with `board open sandbox/payments`.

So the first call changed the state it said it had failed to change, and the second call refuses on the strength of it. A caller who reads the first error and fixes what it names gets a different error, and nothing tells them the board exists.

Either the pane is resolved before anything is created, so a refusal really means nothing happened, or the board is created and the answer says so while explaining that it is not on screen and how to show it. The first is better: it is what every other refusal in the codebase does, and it keeps "an error means no change" true.

Worth checking `board open` and `board save --as` for the same shape while fixing it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A board new that refuses on the pane leaves no board created
- [ ] #2 Or it creates the board and its answer says so, rather than reporting only an error
- [x] #3 board open and board save --as are checked for the same order of operations
- [x] #4 A check covers refusing board new with two panes open and then asserts the board does not exist
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce first. A refused board new creates nothing on this build: the route resolves the pane before it touches the store, checked over REST and through the CLI. What does reproduce is the sequence the report describes: board new succeeds with one pane, the same call with two panes reports only the pane, and closing a pane reveals 'already open'. So the defect is which obstacle gets reported, not a write on the error path.
2. Report the board's own obstacles first in POST /api/boards/new: already open, and already in the vault, both before the pane is resolved. Board is authority and pane is display (ADR 0009), and a name that is taken is state the caller cannot see, while a missing --pane is the command they just typed and the refusal already lists the panes.
3. Same shape in POST /api/boards/open: a board that is in neither memory nor the vault is a fact about the address, so read the note and answer 404 before asking which half of the screen it would go on. One pane resolution still, and still before anything is created.
4. board save --as takes no pane, so it has no such ordering. Its one pre-check side effect is mkdir -p on the note's folder, which happens before the write can still be refused; move it next to the write so everything that can refuse happens before anything is touched.
5. Checks in scripts/check-boards.mjs: board new with two panes is refused and neither the store nor the vault gains the board; a name already open is reported as such with two panes up; board open for a board that is nowhere answers 404 with two panes up.
6. bun run test, then commit src/server.ts and scripts/check-boards.mjs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The refused call does not create the board on this build, and did not before this change either: POST /api/boards/new resolved the pane before it touched the store, which I confirmed over REST and through the CLI against a real server with two sockets standing in for panes. So the write on the error path could not be reproduced.

What does reproduce, exactly as reported, is the sequence: one pane and `board new sandbox/payments` succeeds; two panes and the same call answers only about the pane; close a pane and it answers 'already open'. Someone re-running a script from the top after splitting the canvas sees those three in a row and reads them as the first call having created the board. The defect is which obstacle gets reported, and the consequence the report names is real: you fix what the error names, get a different error, and nothing ever says the board exists.

So the fix is the order of the refusals rather than the order of the write. board new asks whether the name is free before it asks which pane, because a taken name is state the caller cannot see while a missing --pane is the command they just typed, and because board is authority and pane is display (ADR 0009). board open had the same shape and now answers 404 for a board that is in neither memory nor the vault before it asks about panes. Both still resolve the pane before anything is created.

board save --as resolves no pane, so it has no such ordering. Its one pre-check side effect was mkdir -p on the note's folder ahead of the conflict check; that moved next to the write, so a refused save leaves the vault as it found it.

Verified in scripts/check-boards.mjs with two panes up: the refusal creates neither a board nor a note; a taken name is reported as taken; a board that is nowhere answers 404. Reverting the new-route order in dist/ fails 1, reverting the open-route order fails 1, and creating the board before the pane refusal (the bug as reported) fails the 'does not exist' check. All 13 suites pass, 391 checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
board new with two panes open never created the board, on this build or before it: the route resolved the pane before it touched the store. What reproduced was the sequence the report describes, and its cost, which is real: the pane refusal came first, so a caller who added --pane met a second refusal saying the board was already open, and nothing had ever said it existed. board new now asks whether the name is free before it asks which pane, and board open answers 404 for a board that is nowhere before it asks about panes. Both still resolve the pane before anything is created, and board save --as, which resolves no pane, had its mkdir -p moved next to the write so a refused save leaves the vault untouched. Four checks in scripts/check-boards.mjs, run with two panes on a real canvas: the refusal creates neither board nor note, a taken name is reported as taken, a board that is nowhere answers 404. Creating the board before the pane refusal, which is the bug as reported, fails the 'does not exist' check. AC 2 is the alternative that was not taken.
<!-- SECTION:FINAL_SUMMARY:END -->
