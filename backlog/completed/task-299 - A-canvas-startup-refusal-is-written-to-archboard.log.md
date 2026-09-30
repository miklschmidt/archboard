---
id: TASK-299
title: A canvas startup refusal is written to archboard.log
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-09-22 20:47'
updated_date: '2026-09-22 20:51'
labels:
  - bug
dependencies: []
ordinal: 519000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the canvas lifetime fails to start (for example 'Codex startup refused ... config conflicts', TASK-298), the reason reaches the CLI through the startup protocol and is printed, but archboard.log only shows the lifetime stopping, with no error line. The vault and loopback refusals already log; the lifetime start failure in src/server/canvas/lib/canvas-startup.ts startServer does not. Found 2026-09-22 while diagnosing TASK-298.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A canvas whose lifetime fails to start writes the same line the CLI prints to archboard.log at error level, before rollback closes the log.
- [x] #2 The application lifetime test owns the ordering: the startup failure is reported before any resource stops.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add onStartupFailure to the application lifetime options, called in unwindFailedStartup before unwind, while every resource (the logger transports included) still runs.
2. canvas-startup buildLifetime passes onStartupFailure that logger.errors canvasStartupFailureMessage(error), the same line the startup protocol hands the CLI.
3. Extend the partial-startup unwind test in application-lifetime.test.ts to assert the failure is heard before any stop.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Logging in startServer's catch was too late: rollback had already closed the logger-transports resource, so the line was dropped. The public start refusal system test was the wrong owner: its executable scenarios are refused by the CLI preflight (spawn.ts refuseUnstartableCanvas) before any server runs; those are printed to the terminal and stay out of this task. Verified live with a scratch XDG_STATE_HOME holding a foreign config.toml: bin/canvas start exits 3 and archboard.log holds the identical [error] line. lifetime tests 11 pass; tsc and lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A server-side startup failure is now written to archboard.log before rollback closes the log, through a new onStartupFailure hook on the application lifetime. Verified by the extended lifetime unit test and a live refusal whose [error] line matches the CLI output.
<!-- SECTION:FINAL_SUMMARY:END -->
