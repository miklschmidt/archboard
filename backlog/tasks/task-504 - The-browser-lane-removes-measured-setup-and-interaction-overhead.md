---
id: TASK-504
title: The normal test suite removes measured waiting and setup costs
status: Done
assignee:
  - '@codex'
created_date: '2026-10-22 02:13'
updated_date: '2026-10-22 02:43'
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
- [x] #1 The same browser inventory completes faster than the measured baseline, with the before and after environment and durations recorded.
- [x] #2 All existing observable behavior assertions, isolation, cleanup audits and timeout contracts remain in force.
- [x] #3 The complete normal gate passes after the performance change.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use the recorded module, system and browser logs to rank costs, then profile the slow browser owners through the canonical adapter. 2. Reuse controlled clocks for motion where the browser and existing frame assertions support it. Remove artificial fixture pacing and duplicate setup while retaining every behavior assertion, deadline, isolation boundary and cleanup audit. 3. Run focused owners while iterating. Run one complete normal gate at the completed checkpoint and record comparable lane durations. No board is affected because this task changes test infrastructure and fixture setup, not product architecture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Expanded by the user to the whole normal suite: repeated full runs impede iteration. Browser baseline112.17sec, repeat with temporary probes109.72sec. Native browser commands41.26sec, polling49.57sec (overlapping native eval time included). Largest named waits: traffic clock2.27sec; two fake transcript lines1.86sec and1.83sec; live transcript1.58sec. Module case total211.35sec, system wall204.06sec and case total184.55sec. Full gate will run only at the completed checkpoint. All probes will be removed.

First implementation reuses takeFrames from camera-probes for two rendered glide cases and Bun fake timers for twelve pane-reading cases. All35cases and136assertions pass in0.993sec versus12.797sec of case time in the recorded gate. No product duration or assertion changed. Added the controlled-time rule and focused-iteration guidance to docs/agents/test-suite.md.

The five affected browser owners pass through the canonical adapter in22.709sec (voice-box3.167, presented3.798, walkthrough3.362, traffic4.711, livevoice6.198). The earlier same-owner sum was about39.7sec. The new helper installs the existing SteppedClock before application startup, observes each16ms frame, advances160ms per observation, and yields through MessageChannel. It keeps command deadlines and cleanup under the adapter and rejects animations that its clock cannot drive. Removed artificial300ms scripted word pacing while retaining each ordered delta. Consolidated duplicate startup and pointer checks into existing flows. Traffic reuses the time position already exercised by its comparison. Root type-check and targeted lint pass. System fixture commit5c25f9b47 retains the real move CLI and replaces only fixture creation with HTTP; four cases3.42sec to2.30sec. Blocks layout comparison captures13 relevant frames instead of60, with matching audio bounds; case6.912sec to4.01sec. All7focused system cases pass. No board is affected.

Commit 510a33d34 replaces real lock polling and lease waits in the board owners with Bun fake time. The same 33 tests and 100 assertions pass. Focused wall time changed from 7.234 seconds to 2.095 seconds. The held-write case changed from 5.018 seconds to 28 milliseconds. Targeted lint and formatting pass. The complete normal gate now runs once at the completed implementation checkpoint, with output at /tmp/archboard-task504-check.log.

Final evidence on the same NixOS checkout with Bun 1.4.3, agent-browser 0.31.1, and the default managed browser: bun run check passed at 510a33d34 in 557.956 seconds. Modules: 4860 passed, one skipped, zero failed, 221.57 seconds. System: 257 passed, zero failed, 209.84 seconds. Repository: 135 passed, zero failed, 13.30 seconds. All 19 browser owners and cleanup audits passed, with 91.56 seconds summed inside Bun owners versus 110.29 seconds in the baseline. The final browser adapter also rebuilt the frontend after module tests. These browser figures compare owner execution, not build or wrapper time. Full output: /tmp/archboard-task504-check.log. No temporary probes or prototypes remain. The full gate still takes over nine minutes; most time remains in module and system execution.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Controlled clocks replace timer, debounce, and motion waits. Thirty-five UI cases now finish in about one second. The board lock owners fall from 7.234 to 2.095 seconds, with all assertions retained.

Browser motion uses the existing stepped clock and samples every 16 ms frame. The voice fixture sends ordered deltas without artificial pacing. Existing flows absorb duplicate startup and pointer checks. Traffic reuses its compared clock position.

System fixtures avoid seven setup CLI processes and 94 redundant captured frames. Browser execution falls from 110.29 to 91.56 seconds across the same 19 files. No product behavior, timeout, isolation, or cleanup contract changes.

The complete gate passes in 557.956 seconds at 510a33d34. The guide requires controlled time where possible and focused tests during iteration. The remaining suite cost is substantial, with most time in module and system execution.
<!-- SECTION:FINAL_SUMMARY:END -->
