---
id: TASK-082
title: CI runs two of the fifteen checks
status: To Do
assignee: []
created_date: '2026-08-20 20:39'
updated_date: '2026-08-20 20:39'
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
- [ ] #1 A push runs the whole suite, or the checks it deliberately skips are listed with a reason
- [ ] #2 The suite passes on a clean runner, not only on a machine that has been developing archboard
- [ ] #3 A browser-driven check has its browser installed in CI, and is proved to run headless there
- [ ] #4 The wall-clock cost of the suite on a runner is measured and recorded
<!-- AC:END -->
