---
id: TASK-148.12
title: Measure safe concurrency for browser owners
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 23:00'
updated_date: '2026-09-03 13:43'
labels: []
dependencies: []
references:
  - tests/system/browser/run-browser-lane.ts
  - docs/agents/test-suite.md
  - TASK-097
  - TASK-118
parent_task_id: TASK-148
ordinal: 284000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser owners already isolate HOME, XDG config/state, TMPDIR, browser namespace, vault, socket, and session, but the lane serializes all 19 owners due historical contention. Determine which owners can safely run concurrently without weakening frame/timing or cleanup evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Static ownership audit names every remaining shared machine resource and groups owners that can or cannot overlap.
- [x] #2 Human-edit-performance remains exclusive unless new controlled evidence proves otherwise.
- [x] #3 A bounded experiment compares serial and candidate concurrent groups for correctness, elapsed time, flake/timeout behavior, and complete cleanup.
- [x] #4 No runner concurrency change is made without repeatable measured evidence; the task may conclude serialization is still required.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit the browser owners’ shared machine resources, isolated writable resources, and overlap classes.
2. Keep human-edit-performance exclusive and the production runner serial while using a bounded, throwaway max-two-adapter experiment.
3. Compare serial and concurrent owner pairs for correctness, elapsed time, failures/timeouts, and cleanup under the predeclared confirmation gate.
4. Record the measured decision; delete experiment-only code and make no production concurrency or test-inventory change when the gate fails.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Static audit: shared read-only inputs are the checkout/dist, Bun, agent-browser, Chromium, CPU/scheduler, memory/swap, disk/page cache, and browser executable pages. Per-adapter HOME, XDG config/state, TMPDIR, socket, session, namespace, vault, logs, captures, listener, lane root, and owner root are isolated. human-edit-performance stays exclusive; shell-layout is blocked by its shared external artifact path; timing-sensitive and heavy owners remain serial; only fixed-point-document plus malformed-geometry-recovery entered confirmation; opener-settings remains serial because its independent assertion is red.

Exploratory paired evidence found speedups but did not clear classes. Final confirmation at clean tooling boundary 6bb367578942a4ce571ba8c127fe502ff5cd52f5 removed all checked-in experiment driver/support/timing/docs machinery. Snapshot 22f3dd7c4707850704d3eabe21d17b1ffc034804 records focused formatting/lint/static/evidence checks and one prebuild. In valid block 1, serial passed in 5194.90 ms; concurrent fixed-point-document failed with net::ERR_CONNECTION_RESET after 20137.67 ms, malformed-geometry-recovery timed out at 50262.91 ms (exit 124), and adapter-level parent TMP residue was observed. The gate requires zero failures, timeouts, and cleanup failures, so it failed immediately; blocks 2–30 and whole-lane scheduling were not run. Final cgroup/filesystem audit was clean, but it does not erase the recorded adapter-level cleanup failure.

Decision: no-go. Production run-browser-lane remains serial; experiment-only code was deleted; no concurrency tests were added to the system or product suite. This finalization relies on the reviewed evidence snapshot; no product suite was rerun for the task-record-only change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measured browser-owner concurrency is a no-go: final confirmation recorded a connection reset, timeout, and adapter-level cleanup residue in the first concurrent block, so the zero-failure gate failed. The production lane remains serial; experiment-only code was deleted and no concurrency test inventory was added. Verified from reviewed snapshot 22f3dd7c4707850704d3eabe21d17b1ffc034804 and its recorded focused checks and cleanup audit; no product suite rerun was needed for this Backlog-only finalization.
<!-- SECTION:FINAL_SUMMARY:END -->
