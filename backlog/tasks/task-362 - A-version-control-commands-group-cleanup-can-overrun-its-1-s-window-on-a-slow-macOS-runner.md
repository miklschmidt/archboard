---
id: TASK-362
title: >-
  A version-control command's group cleanup can overrun its 1 s window on a slow
  macOS runner
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 18:00'
updated_date: '2026-09-28 18:39'
labels:
  - ci
dependencies: []
priority: low
type: bug
ordinal: 603000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the hosted macOS runner (run 35587589096, 2026-09-21) the engine's version-control lifecycle owner in src/runtime/engine/tests ('... lifecycle owns overflow, cancellation, signals, descendants, and spawn failure') failed after 1082 ms: the output-overflow case expected failure 'output' and got 'cleanup failed after output: the detached process group remained live'. The product waits the process-group cleanup window (1000 ms, the version-control cleanup constant in src/shared/timing/timing.ts) for the killed group to disappear, and the runner took longer. It happened once in nine macOS runs between 2026-09-09 and 2026-09-28. This is a product deadline, not test patience, so TASK-361 left it alone: on a slow machine an output failure is reported as a cleanup failure. Decide whether the window should grow, or whether a late disappearance should still report the original failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The cause of the overrun is confirmed, or the window is changed with its reason written beside it in the timing module
- [x] #2 The lifecycle owner passes on the macOS job across repeated runs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Give the version-control group cleanup window its own value, 3000 ms (three times the 1000 ms it borrowed from the server mutation-drain window), with the reason beside it in src/shared/timing/timing.ts; the command timeout (5000 ms) still bounds it from above. 2. Keep what derives from it consistent: the CLI interrupt grace stays three windows; in the lifecycle owner the prompt-failure bounds and the reaping wait use the window instead of a 1000 ms literal. 3. Run the engine owners and the gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: after SIGSTOP and SIGKILL the product polls up to the group cleanup window for the killed group to leave (terminationError -> processGroupDisappeared in src/runtime/engine/lib/git-command.ts). On GitHub's macOS runner a killed member outlived the 1000 ms window twice in ten runs (35587589096 output case at 1082 ms; 36463179530 abort case at 1114 ms), so the command reported a cleanup failure instead of its own. Considered reporting the original failure when the group leaves late: that still needs a bound on how long to wait, which is this same window, so the window itself is the fix. GIT_PROCESS_GROUP_CLEANUP_MS is now its own 3000 ms with the reason beside it, no longer borrowed from SERVER_MUTATION_DRAIN_TIMEOUT_MS; it stays below GIT_COMMAND_TIMEOUT_MS (5000). Derived values follow: CLI_INTERRUPT_CLEANUP_MS is 9000, TEST_GIT_OPENER_CASE_TIMEOUT_MS grows by 4000. In git-async.test.ts the three prompt-failure bounds and the reaping wait use the window instead of a 1000 ms literal (they still catch waiting through the 5000 ms command timeout), and the owner IPC waits went 1000 -> 3000 ms. Local lanes: lint, fmt:check, type-check, test:modules (3702 pass), test:system with CI env (180 pass, 1 skip), test:repository (8 pass), test:serial-browser with CI exclusion, and the macOS job command on Linux (69 pass), all exit 0. AC2 needs repeated macOS runs.

Verified: the macOS job of run 36465290617 (with GIT_PROCESS_GROUP_CLEANUP_MS at 3000 ms) passed on attempts 1, 2 and 3.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A killed git process group now gets 3000 ms to leave (GIT_PROCESS_GROUP_CLEANUP_MS, reason beside it in timing.ts), still under the 5000 ms command timeout, so a slow macOS runner reports the command's own failure instead of a cleanup failure. Verified by three green macOS attempts of run 36465290617.
<!-- SECTION:FINAL_SUMMARY:END -->
