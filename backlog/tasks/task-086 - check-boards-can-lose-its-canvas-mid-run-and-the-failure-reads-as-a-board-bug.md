---
id: TASK-086
title: 'check-boards can lose its canvas mid-run, and the failure reads as a board bug'
status: To Do
assignee: []
created_date: '2026-08-21 09:01'
labels: []
dependencies: []
references:
  - scripts/check-boards.mjs
  - .github/workflows/ci.yml
priority: medium
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
- [ ] #1 The main canvas in check-boards is verified to be ours before the checks run, the way the scratch one already is
- [ ] #2 A canvas that dies mid-run is reported as the canvas dying, not as the checks that were in flight failing
- [ ] #3 The dying process's stderr reaches the output on every failure path
<!-- AC:END -->
