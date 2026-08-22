---
id: TASK-086
title: 'check-boards can lose its canvas mid-run, and the failure reads as a board bug'
status: To Do
assignee: []
created_date: '2026-08-21 09:01'
updated_date: '2026-08-21 15:30'
labels: []
dependencies: []
references:
  - scripts/check-boards.mjs
  - .github/workflows/ci.yml
priority: high
type: bug
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed once on main at 0c28d6a, during a full `bun run test` immediately after stage 6 landed. Four checks failed in the pane-and-board section and then fetch threw:

```
FAIL - a board can be started with no pane open
FAIL -   and it says nothing is showing it
FAIL - a fresh pane holds the scratch board, so there is something to name
FAIL - a second pane starts on what the first is showing
error: The socket connection was closed unexpectedly
  path: "http://127.0.0.1:33005/api/boards/new", code: "ECONNRESET"
```

The canvas the check spawned was gone. Two runs of `bun run test:boards` on their own and a second full-suite run all passed with zero failures, so it is intermittent rather than a regression — stage 6 did not cause it.

Two things make it worth fixing rather than shrugging at. The failure presents as four substantive board bugs, so the next person to see it will go looking for one; nothing in the output says the server died rather than misbehaved. And CI now runs all 21 suites on every push (TASK-082), on a slower machine, so an intermittent canvas death becomes an intermittent red main.

TASK-077's agent independently reported a flake in the same file — something else holding the port it picked — and guarded the *scratch* canvas by checking `/health` returns its own child's pid before proceeding, moving the port if not. The canvas that died here is the main one at the top of the file, which has no such guard. That is the obvious first hypothesis and it is not confirmed: the crash left no stderr in the output, and the check's failure path is what should have printed it.

Worth checking whether `serverStderr` is being dropped on this path, because a check that loses the dying process's own account of why is the reason this is a guess.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A check's canvas cannot outlive the check, including when the check throws early or is interrupted
- [ ] #2 Every check that spawns a canvas verifies /health reports its own child's pid before asserting anything, the way the scratch canvas already does
- [ ] #3 A canvas that dies mid-run is reported as the canvas dying, not as the checks that were in flight failing
- [ ] #4 The dying process's stderr reaches the output on every failure path
- [ ] #5 A run leaves no listening server and no temp vault behind, proved rather than assumed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause found, and it is not port collision between concurrent runs.

A check's canvas can **outlive the check that spawned it**. Found one an hour after its agent had finished: pid 1376636, running `src/server.ts` out of a completed agent's worktree, listening on 127.0.0.1:41083, `ARCHBOARD_VAULT=/tmp/archboard-live-ITjYb6`. Its temp vault still had `session.excalidraw.md` in it — so the check had not removed the directory either, or removed it and the server recreated it.

That is a worse failure than two runs colliding. An orphan **answers `/health`**, so a check that waits for its canvas to come up can be satisfied by somebody else's server on a recycled port, then make assertions against a board it never wrote. TASK-077's agent guarded the scratch canvas against exactly this by requiring `/health` to report its own child's pid before proceeding; the main canvas in `check-boards` has no such guard, which is consistent with the observed failure — four board assertions failing and then ECONNRESET.

Whatever leaves them behind is the thing to find: a `finally` that does not run on an early throw, a SIGTERM the server does not act on, or a child not killed when the parent exits. Note that `check-boards` starts a *second* canvas for the scratch section, so one script can leak more than one.

Raised to high: CI now runs all 23 suites on every push (TASK-082), on a shared runner, and an orphan that answers `/health` produces a red main nobody can reproduce locally.
<!-- SECTION:NOTES:END -->
