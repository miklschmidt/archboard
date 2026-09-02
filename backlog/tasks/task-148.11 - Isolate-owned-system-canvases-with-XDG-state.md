---
id: TASK-148.11
title: Isolate owned system canvases with XDG state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 23:00'
updated_date: '2026-09-02 23:12'
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
- [ ] #1 Every owned system canvas resolves Codex workbench state under its own disposable XDG_STATE_HOME rather than ~/.local/state.
- [ ] #2 Two focused owners can run concurrently without Dedicated Codex roots locked/colliding errors, and cleanup removes each namespace on success, failure, and interruption.
- [ ] #3 Production stateDir behavior remains unchanged; only test ownership injects isolation.
- [ ] #4 The system lane's forced max-concurrency=1 is not removed in this task without separate measured evidence.
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
<!-- SECTION:NOTES:END -->
