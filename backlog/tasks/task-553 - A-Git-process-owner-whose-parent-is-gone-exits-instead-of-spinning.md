---
id: TASK-553
title: A Git process owner whose parent is gone exits instead of spinning
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26T18:58:00Z'
updated_date: '2026-10-26T18:59:00Z'
labels:
  - process
dependencies: []
type: bug
ordinal: 964000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-26, 37 orphaned packages/process/src/runtime/processes/git-owner.ts processes from four worktrees (t3-aeb72cc3, t3-94639c42, t3-b9e0963e, feat-recursive-module-readings) ran for up to 8 hours at 60 to 90% CPU each and held the 24-core box at load 40 or more. Each owner's git command had ended. The owner waits for its parent's release message before it exits, and its detached process group outlives a parent that dies; with the IPC channel closed, Bun spins. A parent that stops before it sends release (a killed test run or server) leaves one spinning owner per Git command in flight.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An owner whose parent's IPC channel closes before release exits within seconds
- [x] #2 A test fails when the owner ignores a closed channel
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A Git process owner now exits when its parent's IPC channel closes before release (packages/process/src/runtime/processes/git-owner.ts). The parent never closes the channel in normal use, so only a lost parent triggers it. Reproduced first: a parent that exited after the result left its owner adopted by systemd at 55 to 80% CPU; with the fix the owner exits at once. The new test in git-async.test.ts fails without the fix (owner alive after 3 s) and passes with it; bun test packages/process 14 pass; types, lint and format pass. The 37 orphaned owners on the box were stopped with SIGTERM.
<!-- SECTION:FINAL_SUMMARY:END -->
