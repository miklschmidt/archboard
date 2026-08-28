---
id: TASK-086
title: Own canvas test processes from verified startup through cleanup
status: Done
assignee:
  - '@codex'
created_date: '2026-08-21 09:01'
updated_date: '2026-08-28 02:05'
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
- [x] #1 Both canvases spawned by check-boards verify that health.pid is their own child before any board assertion; a foreign or stale responder can never satisfy startup.
- [x] #2 One small lifecycle interface owns child startup, stderr, early-death reporting, bounded graceful shutdown with owned-child escalation, exit waiting, and temporary-vault cleanup.
- [x] #3 Success, an assertion or fetch failure, and an interrupted run leave no owned listener, child process, or temporary vault; automated checks prove the cleanup paths.
- [x] #4 A canvas that dies during the check is reported as process death with its stderr, not as a run of unrelated board assertion failures.
- [x] #5 Only identical lifecycle duplication is migrated. Fixed waits unrelated to process startup or teardown remain outside this task.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add scripts/lib/canvas-test-process.mjs with one owned-canvas constructor. It takes ownership of a caller-seeded temporary vault and the child it spawns, verifies /health reports that child PID, captures stderr, records early exit, and exposes only the canvas address plus restart, liveness-check, and idempotent dispose operations. Restart and dispose wait for exit, use bounded SIGTERM then SIGKILL escalation against the recorded child only, and dispose removes the owned vault. Scoped SIGINT/SIGTERM and process-exit cleanup protect interrupted runs without introducing a general test framework.
2. Replace both ad hoc server lifecycles in scripts/check-boards.mjs with that handle. Keep the scratch test's deliberate graceful and forced restarts, but route them through the owned handle. Make the existing HTTP helpers turn a recorded child exit into one process-death error containing stderr, instead of continuing with board assertions. Leave non-lifecycle waits and every other test process unchanged.
3. Add a focused lifecycle proof inside check-boards.mjs, using a narrow child mode of the same script, that observes the owned PID and vault and then proves cleanup after normal completion, a forced request/assertion failure, and SIGINT interruption. Also prove a deliberately dead canvas reports its exit and stderr. The proof must verify the listener no longer answers and the vault path is gone.
4. Run the lifecycle-only proof and bun run test:boards. Audit live PIDs/listeners and archboard test-vault paths after both success and an intentionally interrupted proof. Do not run the browser chain.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause found, and it is not port collision between concurrent runs.

A check's canvas can **outlive the check that spawned it**. Found one an hour after its agent had finished: pid 1376636, running `src/server.ts` out of a completed agent's worktree, listening on 127.0.0.1:41083, `ARCHBOARD_VAULT=/tmp/archboard-live-ITjYb6`. Its temp vault still had `session.excalidraw.md` in it — so the check had not removed the directory either, or removed it and the server recreated it.

That is a worse failure than two runs colliding. An orphan **answers `/health`**, so a check that waits for its canvas to come up can be satisfied by somebody else's server on a recycled port, then make assertions against a board it never wrote. TASK-077's agent guarded the scratch canvas against exactly this by requiring `/health` to report its own child's pid before proceeding; the main canvas in `check-boards` has no such guard, which is consistent with the observed failure — four board assertions failing and then ECONNRESET.

Whatever leaves them behind is the thing to find: a `finally` that does not run on an early throw, a SIGTERM the server does not act on, or a child not killed when the parent exits. Note that `check-boards` starts a *second* canvas for the scratch section, so one script can leak more than one.

Raised to high: CI now runs all 23 suites on every push (TASK-082), on a shared runner, and an orphan that answers `/health` produces a red main nobody can reproduce locally.

Implemented the approved owned-canvas lifecycle in scripts/lib/canvas-test-process.mjs and migrated both check-boards canvases. The helper now verifies health.pid against the spawned child, retains stderr and early-exit state, waits through graceful or forced restarts, escalates only its recorded child, shares concurrent disposal, and cleans up on SIGINT/SIGTERM. The narrow check-boards child modes prove normal completion, forced fetch failure, SIGINT, and early death with stderr. Focused lifecycle validation and test:boards pass; post-run PID, listener, and recent temporary-vault audits are clean.

Independent-review remediation: serialized restart/dispose behind one operation chain while disposal marks the handle closed immediately. Restart now re-checks that state after its stopped callback and directly before spawn. A focused race proof pauses there, starts disposal, and proves no replacement PID or listener survives. Lifecycle child waits now have a canonical 20-second cap with mode, child PID, and owned PID diagnostics plus forced cleanup. JSON response handling preserves body errors, checks liveness after body consumption, and the early-death fixture now exits after headers so captured stderr is proved on that seam. All new lifecycle durations moved to src/shared/timing/timing.ts with their pull-against relationships.

Final verification: independent fixed-range rereview found no Standards or Spec findings. The integrated main checkout passed bun run test:boards, including all five lifecycle modes, exact owned-PID checks, restart/dispose cleanup, response-body process-death reporting, and the leak audit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced check-boards' duplicated canvas lifecycle code with one narrow owned-process helper. Verified exact PID ownership, bounded shutdown, cleanup after success/failure/SIGINT, restart/dispose serialization, and useful process-death errors through focused lifecycle checks, test:suites, test:boards, type-check, lint, format, and an independent clean review.
<!-- SECTION:FINAL_SUMMARY:END -->
