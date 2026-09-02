---
id: TASK-148.11
title: Isolate owned system canvases with XDG state
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 23:00'
updated_date: '2026-09-02 23:48'
labels: []
dependencies: []
references:
  - tests/system/support/owned-canvas.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - src/runtime/engine/state-dir.ts
  - tests/system/browser/run-browser-lane.ts
modified_files:
  - tests/system/support/owned-canvas.ts
  - tests/system/support/owned-canvas.test.ts
  - tests/system/support/owned-canvas-process-group.test.ts
parent_task_id: TASK-148
ordinal: 283000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
startOwnedCanvas does not forward an isolated XDG_STATE_HOME, so concurrent worktrees and two canvases collide on the machine-global Codex workbench root and lock. Give each owned canvas a disposable home/config/state/temp namespace, following the proven browser-owner recipe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every owned system canvas resolves Codex workbench state under its own disposable XDG_STATE_HOME rather than ~/.local/state.
- [x] #2 Two focused owners can run concurrently without Dedicated Codex roots locked/colliding errors, and cleanup removes each namespace on success, failure, and interruption.
- [x] #3 Production stateDir behavior remains unchanged; only test ownership injects isolation.
- [x] #4 The system lane's forced max-concurrency=1 is not removed in this task without separate measured evidence.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one disposable path set to startOwnedCanvas for HOME, XDG_CONFIG_HOME, XDG_STATE_HOME, and TMPDIR; create the directories with private permissions, force them into every server generation after caller environment values, expose them on OwnedCanvas, and include them in lifecycle diagnostics.
2. Extend owned-canvas seam coverage with an environment-reporting lock fixture: hold two canvases live at once from the same poisoned caller paths, prove their state/workbench lock paths differ, and prove disposal and startup failure remove only each harness-owned namespace while preserving caller state. Extend the existing signal/forced-failure child protocol to record and audit the namespace root.
3. Adjust only focused callers that intentionally need the canvas state path to use the new OwnedCanvas paths; leave production stateDir and system/browser lane serialization unchanged.
4. Run only the focused owned-canvas owners and any directly affected focused owner under separate 60-second transient user services, audit each service for inactive/no-descendant cleanup, record evidence in TASK-148.11, and commit the implementation without finalizing or integrating.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-03 worker evidence before safety stop:
- Added an uncommitted owned-canvas path namespace and a direct two-live-canvas workbench-lock regression. Production stateDir source is untouched.
- Before fix, transient unit archboard-task14811-red-20260903a reproduced the exact second-canvas failure in 114.80ms: Dedicated Codex roots are locked or colliding at the shared XDG state workbench lock (exit 97). Unit was reset to inactive/dead with no cgroup or matching live process.
- After fix, archboard-task14811-lockgreen-20260903a passed the red-capable case (1 test, 17 expectations, 122.21ms). archboard-task14811-partial-20260903a passed partial-start/collision cleanup (1 test, 7 expectations, 428.11ms). After installing the pinned ignored dependencies in archboard-task14811-install-20260903a, archboard-task14811-direct-20260903b passed the complete direct owner (9 tests, 53 expectations, 5.84s). Every unit was inactive/dead with no cgroup descendants before the next project command.
- Blocking evidence: archboard-task14811-group-20260903a ran the focused process-group owner and returned exit 1 after 7.05s (memory peak 622,383,104 bytes). Seven cases passed, including normal, forced failure, SIGINT, early death, restart/dispose race, and pre-replacement escalation. The existing timeout case failed at owned-canvas-process-group.test.ts:453 because failure.replacement was undefined after 1,196.90ms. The service had no cgroup or matching live owned-canvas process, then was reset to inactive/dead. Assignment safety says any service failure stops all project execution, so no retry, further edit, commit, or finalization was performed. Current source/test/task changes remain uncommitted at base d093371492ddf9acf2da443b8dc148f7356d052c.

2026-09-03 resumed focused resolution:
- Parent clarified that the clean assertion failure was diagnostic feedback. The exact timeout case reproduced unchanged in archboard-task14811-exact-20260903a: replacement remained undefined after 1,149.60ms; service memory peak 165,773,312 bytes, then inactive/dead with no cgroup or owned namespace residue.
- Cause: the one-second intentional hang timer began at child spawn, before the initial isolated state setup, retired-port collision, automatic port replacement, and replacement-canvas precondition. The new clean state made that precondition exceed the timer. The test now arms the unchanged TEST_CANVAS_SHUTDOWN_TIMEOUT_MS only when replacement-canvas is observed. No timeout increased, sleep added, or cleanup assertion relaxed.
- Exact case passed in archboard-task14811-exact-20260903b: 1 test, 12 expectations, 3,209.79ms. Final direct owner archboard-task14811-direct-20260903d passed 9 tests/53 expectations in 5.68s. Final process-group owner archboard-task14811-group-20260903c passed 8 tests/68 expectations in 9.78s. Each ran in a fresh 20-second unit and was verified inactive/dead with empty ControlGroup/cgroup.procs absent. A strict six-character namespace-root scan was empty after every final owner.
- Scope remains the owned system-test harness and its two focused owners. Production stateDir, workbench production composition, max-concurrency=1, and browser serialization are unchanged.

2026-09-03 fresh remediation and focused validation:
- Root cause: marker-bound lifecycle cases installed TEST_CANVAS_SHUTDOWN_TIMEOUT_MS from spawn, so the one-second scenario deadline could expire during namespace setup, retired-port replacement, and replacement-canvas preconditions. runLifecycleChild now keeps a distinct TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS spawn watchdog. That existing 20,000 ms timing-authority value already names the full spawn-through-cleanup pull. The first matching marker clears it and arms the one-second scenario deadline exactly once. No timing-authority edit was needed.
- The missing-marker owner injects TEST_CANVAS_SHUTDOWN_TIMEOUT_MS as a one-second spawn watchdog while leaving the normal 20-second scenario/default bound intact. It proves the no-marker path quickly without a new sleep or a long production-style wait, then asserts the harness and canvas PIDs are gone and the exact vault and namespace root are absent.
- Preserved the strict namespace-root predicate, exact workbench/lock relationships, SIGKILL path diagnostics, and both timeout cleanup assertions. The concurrent release deadline and its strict pre-release timestamp assertion remain unchanged.
- Focused formatting and Oxlint passed in archboard-task14811-static-20260903e.service: three changed files, 0 warnings and 0 errors, 0.450s service runtime.
- Direct owner passed in archboard-task14811-direct-20260903e.service: 10 tests, 65 expectations, 6.11s Bun time, 6.130s service runtime, 163.7 MB peak.
- Final process-group owner passed in archboard-task14811-group-20260903e.service: 8 tests, 70 expectations, 9.12s Bun time, 9.140s service runtime, 647.5 MB peak. The concurrent case passed in 1,060.40 ms, so the earlier 33 ms miss did not recur without assertion or timing padding. The replacement-marker timeout passed in 3,187.29 ms and the injected missing-marker watchdog passed in 2,003.59 ms.
- Every validation service used KillMode=control-group, a 20-second start cap, and a 5-second stop cap. Final audits showed MainPID=0, empty ControlGroup, no cgroup path or descendants, and empty exact /tmp scans for archboard-owned-canvas-XXXXXX namespaces and archboard-lifecycle-child-XXXXXX vaults. All final services exited successfully with no OOM or residue. Production stateDir, browser/system serialization, and max-concurrency=1 remain unchanged.

2026-09-03 integration finalization:
- Landed reviewed commits 18162d87e33878d2bd88992e26ef05bf95f64718 and 6e0db7d8c3d7cd13141ebb5773440c4c2ecb6f43 onto bd2a5d59e52a064b33791dcdd67d7344aa76fa8b as 63175cd76a66986e19f8c0884881ebc9ea9ad00e and f0fbaf65f0d82e7e6343fa0940a34831f053d0e8.
- Independent Standards and Spec rereviews reported REVIEW_CLEAN for bd2a5d59e52a064b33791dcdd67d7344aa76fa8b...6e0db7d8c3d7cd13141ebb5773440c4c2ecb6f43.
- Recorded focused evidence: OxFmt and OxLint passed for the three implementation/test files in 0.450s; direct owner passed 10 tests, 65 expectations in 6.11s Bun and 6.130s service time, 163.7MB peak; process-group owner passed 8 tests, 70 expectations in 9.12s Bun and 9.140s service time, 647.5MB peak. Replacement-marker case took 3.187s and missing-marker case 2.004s.
- Each final service was inactive/dead with MainPID=0, empty ControlGroup, no cgroup paths or namespace/vault roots, no OOM, no 124/125, and no process fan-out. Static integration inspection confirms production stateDir, workbench composition, and browser-lane max-concurrency=1 are unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Isolated each owned system canvas in a disposable HOME, XDG_CONFIG_HOME, XDG_STATE_HOME, and TMPDIR namespace, preventing Codex workbench-lock collisions without changing production state or system-lane serialization. Focused direct and process-group owners passed, with cleanup verified across success, failure, interruption, timeout, and replacement lifecycle paths.
<!-- SECTION:FINAL_SUMMARY:END -->
