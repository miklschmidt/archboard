---
id: TASK-553
title: A Git process owner whose parent is gone exits instead of spinning
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26T18:58:00Z'
updated_date: '2026-10-26T19:06:00Z'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spec review reproduced two gaps in the initial disconnect handler: an owner disconnected before start and an owner running a long-lived command both remained alive after 3 seconds. Resolving release alone could not bypass the awaited start, command exit, or output forwarding. The revised handler uses the existing detached-group identity and signal helpers to kill its own group on a lost parent, so an active Git child does not become an orphan. The handler is removed before the normal intentional disconnect; explicit release still waits for the parent inspection and output drain. Five immediate disconnect probes now exited within the 3-second bound. The current Archboard board describes the process package as owning and ending child process groups and remains accurate; no proposal is needed. No agent-facing interface or evaluated consumer-skill behavior changes, so the consumer skill and evaluation scenarios remain accurate.

Review validation: system Bun 1.4.3 ran bun test packages/process after the runtime and regression changes: 16 passed, 0 failed. Coverage includes disconnect before start, during a live command, and after the result, plus normal explicit release, output limits, cancellation, and descendant cleanup.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A Git process owner now exits when its parent's IPC channel closes before release (packages/process/src/runtime/processes/git-owner.ts). The parent never closes the channel in normal use, so only a lost parent triggers it. Reproduced first: a parent that exited after the result left its owner adopted by systemd at 55 to 80% CPU; with the fix the owner exits at once. The new test in git-async.test.ts fails without the fix (owner alive after 3 s) and passes with it; bun test packages/process 14 pass; types, lint and format pass. The 37 orphaned owners on the box were stopped with SIGTERM.
<!-- SECTION:FINAL_SUMMARY:END -->
