---
id: TASK-470
title: >-
  Main's hosted CI fails intermittently: macOS Git group cleanup, a React flush
  after teardown, rasterizer and variant browser cases
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-12 01:12'
labels:
  - ci
dependencies: []
type: bug
ordinal: 815000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Main's hosted gate fails in roughly one of four runs for reasons unrelated to the change under test, so a red run says nothing and gets re-run. Three recurring failures: (1) the macOS job's Git lifecycle owner (src/runtime/engine/tests/git-async.test.ts) reports 'cleanup failed after output: the detached process group remained live' instead of 'output' (runs 38188575539 attempt 1, 37776895342; TASK-362 widened the window from 1 s to 3 s and it still fails at exactly the window); (2) the Linux modules lane fails with 'Unhandled error between tests: ReferenceError: window is not defined' after src/ui/semantic-board-canvas/tests/semantic-board-traffic-rest.test.tsx (runs 38148069388, 38153663557, 38185691095); (3) rarer rasterizer 'real pixels...' and browser 'choosing a variant in the navigator...' failures (runs 38178028512, 38180803797).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Git lifecycle owner's macOS failure has a confirmed root cause and a fix in the product or the test that matches it
- [ ] #2 The traffic-rest owner leaves no React work that outlives its DOM teardown
- [ ] #3 Each rarer failure seen on main or branches in the last two days is either fixed at its cause or listed with its run ids as unexplained
- [ ] #4 At least five consecutive hosted full gates (Linux and macOS) pass on the fixes
- [ ] #5 The complete local gate passes on the fixes
<!-- AC:END -->
