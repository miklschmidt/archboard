---
id: TASK-148.05
title: Replace browser timing sleeps with controlled owners
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-03 14:19'
labels: []
dependencies: []
modified_files:
  - src/ui/canvas/canvas-deadlines.ts
  - src/ui/canvas/hold-attempt.ts
  - src/ui/canvas/tests/canvas-deadlines.test.ts
  - src/ui/canvas/tests/change-reporting-scheduling.test.ts
  - src/ui/canvas/useCanvasSession.ts
  - tests/system/browser/board-navigator.test.ts
  - tests/system/browser/claim-interaction.test.ts
  - tests/system/browser/support/claim-interaction.ts
  - tests/system/browser/hold-generation.test.ts
  - tests/system/browser/human-edit-performance.test.ts
  - tests/system/browser/server-update-ordering.test.ts
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 276000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser coverage keeps rendered user-visible behavior while controlled-clock module owners prove pure scheduling without direct wall-clock sleeps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pure scheduling assertions move from direct 800 ms, 650 ms, 400 ms, 1100 ms, and 400 ms browser sleeps into controlled-clock module owners.
- [ ] #2 Changed browser owners retain rendered and user-visible behavior through observable conditions.
- [ ] #3 The real serial browser lane passes for every changed browser owner, with no responsive or human-edit regression.
- [ ] #4 Browser renderer observations are measured after raw sleeps become observable conditions before any waiver is considered.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add controlled-clock module owners for pane-report debounce and hold-renewal deadlines, and strengthen the existing change-reporting scheduling owner for the single idle-tail contract.
2. Replace the five production-duration browser sleeps with request completion, pane registry, report completion, and scene-convergence observations while preserving every rendered and user-visible assertion.
3. Run exact changed module tests, exact-file lint and format checks, and each changed browser owner serially through the verified capped-command wrapper. Record before and after durations in task notes.
4. Audit BASE..HEAD, owned processes, and temporary artifacts, then commit for independent review.

5. Review remediation: route hold-attempt settlement through one generation-aware renewal decision, then prove stale A1 settlement and current A2 renewal together with the manual clock across LOCK_RENEW_MS.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Before/after focused browser measurements on the same host, using the serial browser adapter through the verified capped-command wrapper:
- board-navigator: 6.79 s before, 6.26 s after.
- server-update-ordering: 12.18 s before, 8.54 s after.
- hold-generation: 6.16 s before, 6.01 s after.
- claim-interaction: the baseline failed after 3.19 s at a stale fixture call that sent pane to strict POST /api/boards/new; after separating create from open, the complete owner passed in 9.93 s.
- human-edit-performance: 73.93 s before, 76.84 s after. The workload variance exceeded the removed waits; direct after metrics remained 16.7 ms median frame, 16.8 ms worst report-correlated frame, 13 fsyncs, compact 288-byte responses, and zero corrections.

The final serial pass ran exactly the five changed owners without overlap. All passed. Module clock owners passed 16 focused tests in 55 ms. Exact-file Oxlint and Oxfmt checks passed. No changed browser owner contains Bun.sleep. Navigator stale completion now uses an explicitly held/released preview request; claim camera safety waits for the changed viewport in /api/panes; report and human-edit flows wait for report or scene convergence. Controlled module owners advance the 300 ms pane debounce, 1,000 ms hold renewal, and 800 ms report idle tail without wall time.

Review remediation composes generation ownership with renewal scheduling at the production finally-path seam. The controlled-clock owner passes (4 tests, 18 expectations) and proves stale A1 settlement remains inert through LOCK_RENEW_MS while current A2 settlement schedules exactly one renewal. The individual hold-generation browser owner passes (1 test, 22 expectations).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-03 14:17
---
Independent review found that the first implementation tested deadline and generation identity separately, so it did not prove their composition. Remediation adds the smallest production seam used by the real finally path and one composed controlled-clock owner.
---
<!-- COMMENTS:END -->
