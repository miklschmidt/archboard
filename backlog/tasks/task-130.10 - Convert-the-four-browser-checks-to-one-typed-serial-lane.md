---
id: TASK-130.10
title: Convert the four browser checks to one typed serial lane
status: To Do
assignee: []
created_date: '2026-08-28 01:05'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
  - TASK-130.06
  - TASK-130.08
  - TASK-130.09
references:
  - scripts/check-fixed-point.mjs
  - scripts/check-human-edit-performance.mjs
  - scripts/check-live-session.mjs
  - scripts/check-typed-text.mjs
  - docs/agents/test-suite.md
  - TASK-086
  - 'https://bun.com/blog/bun-v1.4#bun-test'
parent_task_id: TASK-130
priority: high
type: task
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Convert fixed-point, human-edit performance, live-session, and typed-text checks only after the non-browser process lanes have established typed lifecycle patterns. These are the four checks that drive a real renderer and must never share the machine concurrently.

Use native Bun assertions inside the browser tests, with one small typed command adapter for prerequisite detection, frontend build reuse, and the documented could-not-run exit. Do not use Bun file parallelism for this lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-fixed-point, check-human-edit-performance, check-live-session, and check-typed-text are replaced by typed Bun tests reached only through one explicitly sequential browser lane.
- [ ] #2 The lane refuses to claim a pass without agent-browser, returns the documented could-not-run outcome, asserts a headless user agent, and never maps a browser window.
- [ ] #3 Frontend freshness is checked once per lane so unchanged sources build at most once, and each browser process and canvas uses verified ownership and bounded cleanup.
- [ ] #4 Fixed-point coverage preserves zero document diff, malformed-geometry recovery, off-screen inspection export, exact PNG and manifest bytes, bridge suppression, clipping, and unchanged visible pane state.
- [ ] #5 Live-session coverage preserves all 42 cycles, equality after every cycle, server-update ordering, user-edit scheduling, held-board behavior, and hold-generation recovery.
- [ ] #6 Typed-text coverage still lets Excalidraw mint IDs, exercises open editors across writes, and proves every character and rename reaches the board and note.
- [ ] #7 Human-edit performance preserves the 10,000-element human-only reproduction, compact acknowledgement, no scene replacement, structural response checks, same-run relative frame diagnostics, and the rule against fixed millisecond product gates.
- [ ] #8 Every test source file is at most 500 lines; browser tests use condition polling and named timing margins, and no test enters a parallel, random, changed-only, or generic recursive lane by accident.
- [ ] #9 Representative fixed-point, typing, report-order, renderer, and human-response regressions fail before the old scripts are deleted, and the complete browser lane passes repeatedly in documented order.
<!-- AC:END -->
