---
id: TASK-362
title: >-
  A version-control command's group cleanup can overrun its 1 s window on a slow
  macOS runner
status: To Do
assignee: []
created_date: '2026-09-28 18:00'
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
- [ ] #1 The cause of the overrun is confirmed, or the window is changed with its reason written beside it in the timing module
- [ ] #2 The lifecycle owner passes on the macOS job across repeated runs
<!-- AC:END -->
