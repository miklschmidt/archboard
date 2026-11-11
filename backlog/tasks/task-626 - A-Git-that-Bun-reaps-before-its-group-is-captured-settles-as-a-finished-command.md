---
id: TASK-626
title: >-
  A Git that Bun reaps before its group is captured settles as a finished
  command
status: In Progress
assignee: []
created_date: '2026-11-11T00:54:00Z'
updated_date: '2026-11-11T00:56:00Z'
labels:
  - bug
  - ci
  - process
dependencies: []
type: bug
ordinal: 1070000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On macOS, Bun collects a child that is already exiting when it cannot register a kqueue exit watch for it (kevent fails with ESRCH), either inside Bun.spawn or on a detached thread. A fast Git command can therefore be gone before captureDetachedProcessGroup reads it, and the Git runner fails with 'Could not capture Git process-group ownership: Detached process N vanished before its group could be captured.' The macOS native process ownership CI job fails intermittently on tests that run Git through the CLI (seen on PR #92: tests/system/models/model-proposals.test.ts, 'CLI selectors and reader HTTP addresses prefer a state's name over another state's former name'). Only this process's runtime can reap its own child, so a vanished detached leader has exited. TASK-470 fixed an earlier macOS Git group flake.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A detached leader that has exited and been reaped, and whose group is empty, captures as no group instead of an error
- [x] #2 A reaped leader whose group still has a member still refuses ownership
- [ ] #3 A Git command whose leader was reaped before capture returns its output and exit status like any finished command
- [x] #4 A focused test fails without the fix and passes with it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. captureDetachedProcessGroup returns undefined when the leader is gone and its group is proven empty, and refuses ownership when the group outlived the leader.
2. The Git runner treats no group as a Git that already finished: no orphan guard, nothing to kill, no group to inspect or release.
3. Test: a detached child awaited to its exit captures as no group; one that leaves a member in its group refuses ownership.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: on macOS, when kevent cannot register an EVFILT_PROC exit watch for a child that is already exiting (ESRCH), Bun reaps the child itself, in the spawn or on a detached thread (oven-sh/bun #41732, #45483). A fast Git can then be absent from the process census when captureDetachedProcessGroup reads it, which the runner reported as a cleanup failure. Linux watches through a pidfd and keeps the zombie, so the race is macOS-only. The two new tests in packages/process/tests/runtime/processes/git-async.test.ts both fail against the old group.ts and pass with the fix. AC 3 rests on the runner's code path (no group means no guard, nothing to kill or inspect) and waits on the macOS CI job.
<!-- SECTION:NOTES:END -->
