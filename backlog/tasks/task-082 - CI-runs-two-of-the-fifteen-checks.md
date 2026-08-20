---
id: TASK-082
title: CI runs two of the fifteen checks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 20:39'
updated_date: '2026-08-20 21:35'
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
- [ ] #2 The suite passes on a clean runner, not only on a machine that has been developing archboard
- [ ] #3 A browser-driven check has its browser installed in CI, and is proved to run headless there
- [ ] #4 The wall-clock cost of the suite on a runner is measured and recorded
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
## What changed

.github/workflows/ci.yml runs `bun run test` and nothing else, so the list of checks lives in package.json where it is already maintained and the workflow cannot fall behind it again. The two steps it used to name are inside the chain.

scripts/check-ci-suites.mjs (`bun run test:suites`, seventeenth in the chain) enforces that: a `test:*` script in neither the chain nor its SKIPPED map fails the suite, a script in both fails, and a workflow that runs a suite by name fails unless that suite is one the chain skips. Both failure modes were exercised by hand: dropping test:hot from the chain, and pointing a workflow step at test:boards.

test:browser is the one entry in SKIPPED, with the reason written next to it. CI runs it in a second job that installs agent-browser 0.34.0 from npm and downloads Chrome with `agent-browser install --with-deps`. That job carries continue-on-error because the check asserts the 2026-08-20 baseline of 8 of 12 elements changed rather than the zero we want; TASK-072 turns it into a guard and takes the flag off.

## Measured on this box, 13th-gen i7, scrubbed environment (empty HOME, no ARCHBOARD_*, minimal PATH)

Whole chain 58.6s, all seventeen green. vite build 8.5s. test:browser 2.4s with --skip-build.

Per suite: mcp 20.9, boards 10.5, side-by-side 9.4, hot 7.5, one-write 2.9, type-check 2.0, repos 1.4, changes 1.2, module-scope 0.5, install 0.5, branch 0.4, bind 0.3, geometry 0.3, labels 0.3, obsidian 0.02, library 0.08, parity 0.03. Three suites are two thirds of the time, and all three spawn a canvas.

## The only real runner numbers, and they are for the old workflow

Run 32414737857 on main (0369c30, 2026-08-20 20:33, ubuntu-latest) ran the two-check workflow in 49s wall: setup 4s, install 2s, type check 10s against 2.0s here, vite build 28s against 8.5s here. So a runner is 3 to 5 times slower on the CPU-bound steps. Much of the chain is settle windows and sleeps, which do not scale with CPU, so the new job should land between 2 and 5 minutes. That is a projection from a local measurement, not a runner measurement, which is why AC 4 is unchecked.

## A bug the scrubbed run found

scripts/check-fixed-point.mjs failed with "session name is too long. Socket path would be 158 bytes (max 103)" under a deep HOME, because agent-browser derives its socket directory from HOME and the daemon socket is <dir>/<session>.sock. A GitHub runner's /home/runner is short enough to have got away with it, but nothing was holding it there. The check now makes a short socket dir under TMPDIR and passes AGENT_BROWSER_SOCKET_DIR, and the environment that failed before now passes.

Also seen: with a completely empty HOME and no browser downloaded, agent-browser fell back to a system chromium and the check still passed with the same 8 of 12 and the same field lists. With agent-browser off PATH entirely it exits 2 and says so, which is what keeps a missing browser from reading as a pass.

## Which criteria are verified, and which are argued

Verified. AC 1: the workflow runs the whole chain, the one skip carries a written reason, and check-ci-suites.mjs fails when either drifts. Both drift cases were made to fail on purpose.

Argued, not proved, because nobody may push from here. AC 2, AC 3 and AC 4 all need a run on a runner.

AC 2 rests on a full scrubbed run: empty HOME, no ARCHBOARD_* of any kind, no .env, a minimal PATH, and the state directory and repo registry landing in the throwaway HOME. Every suite that starts a canvas makes its own temp vault and its own random port, and check-repos and check-hot-reload also override ARCHBOARD_REPOS and XDG_STATE_HOME. Nothing read the user's vault, the real registry, or the canvas on :3000. What a push would still confirm: that bun install --frozen-lockfile resolves on the runner, and that no suite depends on a tool the ubuntu image lacks.

AC 3 rests on the check passing here against a browser it found rather than one it downloaded, and on it exiting 2 when there is none. What a push would confirm: that `agent-browser install --with-deps` works on the image, that the socket path and headless Chrome behave under HOME=/home/runner, and above all whether the 8-of-12 field table reproduces there. Text width and height come from Excalidraw's own measureText against a bundled font, so it should, but a different Chrome could move a field and the table is what will name which one.

AC 4 rests on a local measurement and a scaling factor taken from the old workflow's runner timings. Nobody has timed this chain on a runner.

The honest summary: two of the four criteria (2 and 3) cannot be closed until somebody pushes and watches the run, and the fourth (4) closes when that run's step timings are copied back onto this task.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 21:35
---
Left In Progress on purpose. The workflow is written and the local evidence is in the notes, but AC 2, 3 and 4 close on the first push: watch both jobs, then copy the step timings onto this task and check 2 and 4, and check 3 if the browser job goes green with the same 8-of-12 field table. If the table differs on the runner, that is TASK-072's input, not a regression here.
---
<!-- COMMENTS:END -->
