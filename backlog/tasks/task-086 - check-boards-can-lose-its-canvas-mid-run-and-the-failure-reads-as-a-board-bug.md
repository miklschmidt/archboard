---
id: TASK-086
title: Own canvas test processes from verified startup through cleanup
status: To Do
assignee: []
created_date: '2026-08-21 09:01'
updated_date: '2026-08-28 00:35'
labels: []
dependencies: []
references:
  - scripts/check-boards.mjs
  - scripts/lib
  - .github/workflows/ci.yml
priority: high
type: bug
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Canvas-spawning checks duplicate child startup, health polling, stderr capture, shutdown and temporary-vault cleanup. check-boards has leaked a child and vault after an interrupted or failed run, and an unrelated server on a recycled port can satisfy its current health wait.

Fix the concrete lifecycle failure. Build one small test-process module whose interface starts an owned canvas and disposes it. It must verify health.pid matches the spawned child, retain stderr, notice early death, wait for exit, escalate shutdown only for its own child, and remove its owned vault. Use it for both canvases in check-boards and only migrate another check when its lifecycle is genuinely the same.

TASK-097 is folded into this task only where condition-based startup and teardown are part of that lifecycle. Do not audit every sleep in scripts, create a general timing framework, or rewrite checks whose subject is elapsed time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both canvases spawned by check-boards verify that health.pid is their own child before any board assertion; a foreign or stale responder can never satisfy startup.
- [ ] #2 One small lifecycle interface owns child startup, stderr, early-death reporting, bounded graceful shutdown with owned-child escalation, exit waiting, and temporary-vault cleanup.
- [ ] #3 Success, an assertion or fetch failure, and an interrupted run leave no owned listener, child process, or temporary vault; automated checks prove the cleanup paths.
- [ ] #4 A canvas that dies during the check is reported as process death with its stderr, not as a run of unrelated board assertion failures.
- [ ] #5 Only identical lifecycle duplication is migrated. Fixed waits unrelated to process startup or teardown remain outside this task.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause found, and it is not port collision between concurrent runs.

A check's canvas can **outlive the check that spawned it**. Found one an hour after its agent had finished: pid 1376636, running `src/server.ts` out of a completed agent's worktree, listening on 127.0.0.1:41083, `ARCHBOARD_VAULT=/tmp/archboard-live-ITjYb6`. Its temp vault still had `session.excalidraw.md` in it — so the check had not removed the directory either, or removed it and the server recreated it.

That is a worse failure than two runs colliding. An orphan **answers `/health`**, so a check that waits for its canvas to come up can be satisfied by somebody else's server on a recycled port, then make assertions against a board it never wrote. TASK-077's agent guarded the scratch canvas against exactly this by requiring `/health` to report its own child's pid before proceeding; the main canvas in `check-boards` has no such guard, which is consistent with the observed failure — four board assertions failing and then ECONNRESET.

Whatever leaves them behind is the thing to find: a `finally` that does not run on an early throw, a SIGTERM the server does not act on, or a child not killed when the parent exits. Note that `check-boards` starts a *second* canvas for the scratch section, so one script can leak more than one.

Raised to high: CI now runs all 23 suites on every push (TASK-082), on a shared runner, and an orphan that answers `/health` produces a red main nobody can reproduce locally.
<!-- SECTION:NOTES:END -->
