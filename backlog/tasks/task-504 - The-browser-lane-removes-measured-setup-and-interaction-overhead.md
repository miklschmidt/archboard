---
id: TASK-504
title: The normal test suite removes measured waiting and setup costs
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-22 02:13'
updated_date: '2026-10-22 02:21'
labels: []
dependencies: []
type: bug
ordinal: 911000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user finds the browser lane too slow for normal development. The TASK-502 run took about 112 seconds for 19 files, with 110.29 seconds inside the Bun owners. Runner and cleanup overhead is about two seconds, so the next measurement must separate browser startup, command launches and fixed waits within the owners.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The same browser inventory completes faster than the measured baseline, with the before and after environment and durations recorded.
- [ ] #2 All existing observable behavior assertions, isolation, cleanup audits and timeout contracts remain in force.
- [ ] #3 The complete normal gate passes after the performance change.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use the recorded module, system and browser logs to rank costs, then profile the slow browser owners through the canonical adapter. 2. Reuse controlled clocks for motion where the browser and existing frame assertions support it. Remove artificial fixture pacing and duplicate setup while retaining every behavior assertion, deadline, isolation boundary and cleanup audit. 3. Run focused owners while iterating. Run one complete normal gate at the completed checkpoint and record comparable lane durations. No board is affected because this task changes test infrastructure and fixture setup, not product architecture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Expanded by the user to the whole normal suite: repeated full runs impede iteration. Browser baseline112.17sec, repeat with temporary probes109.72sec. Native browser commands41.26sec, polling49.57sec (overlapping native eval time included). Largest named waits: traffic clock2.27sec; two fake transcript lines1.86sec and1.83sec; live transcript1.58sec. Module case total211.35sec, system wall204.06sec and case total184.55sec. Full gate will run only at the completed checkpoint. All probes will be removed.

First implementation reuses takeFrames from camera-probes for two rendered glide cases and Bun fake timers for twelve pane-reading cases. All35cases and136assertions pass in0.993sec versus12.797sec of case time in the recorded gate. No product duration or assertion changed. Added the controlled-time rule and focused-iteration guidance to docs/agents/test-suite.md.
<!-- SECTION:NOTES:END -->
