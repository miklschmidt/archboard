---
id: TASK-082
title: CI runs two of the fifteen checks
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:39'
updated_date: '2026-08-22 15:02'
labels: []
dependencies: []
references:
  - .github/workflows/ci.yml
  - package.json
  - docs/design/the-plan.md
priority: high
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while working out where a browser-driven check would run.

The workflow runs the type check, builds the frontend, asserts the bundle exists, and then runs exactly two checks: the MCP stdio wire and the loopback bind guard. The other thirteen exist, pass locally, and are never enforced on main.

That includes every check written this week to stop a regression coming back: bound labels staying with their containers, arrows measured from their paths, a branched variant comparing cleanly against a redrawn one, the source board surviving a side-by-side, board addressing and panes, repository bindings, the reload canary, and the surface parity check that keeps the MCP surface honest. Each was built because something had already gone wrong once. None of them run on a push.

The two that do run were chosen for a reason worth keeping: the bind guard protects an invariant with a security consequence, and the stdio check protects the wire an external client talks over. So this is not neglect, it is a suite that grew past a workflow nobody revisited.

What makes it urgent now rather than tidy: the plan in docs/design/the-plan.md rewrites the conversion path, the write path and the store, and leans on these checks as the safety net for doing that. A safety net that only runs when somebody remembers to run it is the same shape of problem as an invariant nobody enforces, which this codebase has spent a week removing.

Two things to work out rather than assume. How long the full suite takes on a runner, since several checks spawn a canvas and one drives a real browser once TASK-071 lands. And what a browser-driven check needs on a fresh runner: `agent-browser install` fetches the browser, and a runner has neither it nor chromium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A push runs the whole suite, or the checks it deliberately skips are listed with a reason
- [x] #2 The suite passes on a clean runner, not only on a machine that has been developing archboard
- [x] #3 A browser-driven check has its browser installed in CI, and is proved to run headless there
- [x] #4 The wall-clock cost of the suite on a runner is measured and recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Merge main and read the workflow, the chain in package.json and scripts/check-fixed-point.mjs.
2. Measure every suite one at a time in a scrubbed environment (empty HOME, no ARCHBOARD_*, minimal PATH), which is the closest available proxy for a clean runner.
3. Replace the two named script steps with one 'bun run test', so the list lives in package.json where it is already maintained.
4. Add scripts/check-ci-suites.mjs, which fails when a test:* script is in neither the chain nor a skip list carrying a reason, and put the workflow's own drift under the same check.
5. Give the browser check a job of its own that installs agent-browser and Chrome, non-blocking while it asserts the 8-of-12 baseline.
6. Record the timings, and say plainly which acceptance criteria a push still has to confirm.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed on runner evidence, not on argument. Two runs on miklschmidt/archboard.

**Run 32502079882** (first push, red) proved three of the four on its own. All 23 suites executed. `agent-browser` installed on a fresh ubuntu-24.04 runner and both browser checks ran headless there — `fixed-point` passed at 30.4 s. One check failed, and it was worth having.

**Run 32580267261** (after the fix, green) is AC 2: the whole suite passes on a clean runner, not only on a machine that has been developing archboard.

## AC 4, measured rather than projected

Suite step, first check to last: **120 s** plus live-session; whole job 3m45s including checkout, `bun install --frozen-lockfile` and the vite build. Per suite, seconds:

    fixed-point 30.4 · mcp-stdio 22.0 · lock 21.2 · boards 13.7 · side-by-side 10.3
    hot-reload 7.8 · one-write 3.9 · repos 2.5 · module-scope 1.3 · changes 1.3
    install-doc 1.0 · local-bind 0.9 · branch-compare 0.9 · staleness 0.8
    surface-parity 0.7 · geometry 0.6 · labels 0.6 · obsidian-md 0.1
    text-metrics 0.1 · library 0.1 · ci-suites 0.0

The projection recorded when this task was written was 2 to 5 minutes against ~105 s locally, reasoned from the runner being 3 to 5 times slower on CPU-bound steps while much of the chain is settle windows that do not scale with CPU. That reasoning held: socket-bound checks barely moved (mcp 20.9 local to 22.0, side-by-side 9.4 to 10.3, hot 7.5 to 7.8) and the build-bound one moved a lot (fixed-point 2.4 s with `--skip-build` locally against 30.4 s building on the runner).

## What CI caught that no local run could

`check-live-session`'s fail-closed assertion killed the canvas, slept 1.5 s and read the pane. On a runner the process had not finished dying, the socket was still open, the pane was still correctly connected, and the check reported a fail-open that had not happened. It was measuring how fast a runner tears down a process.

Fixed in 379aeca: wait for the process to actually exit, then poll the pane for a bounded five seconds. The bound is the point — a pane slow to fail closed is one a person can keep drawing into. Revert-proofed: breaking `readOnly`'s socket half fails this check and nothing else.

Worth noting for TASK-079's record: its author reported this window as uncovered, needing 'a second writer inside a ~200 ms window that nothing here can schedule'. A slower runner scheduled it.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 21:35
---
Left In Progress on purpose. The workflow is written and the local evidence is in the notes, but AC 2, 3 and 4 close on the first push: watch both jobs, then copy the step timings onto this task and check 2 and 4, and check 3 if the browser job goes green with the same 8-of-12 field table. If the table differs on the runner, that is TASK-072's input, not a regression here.
---
<!-- COMMENTS:END -->
