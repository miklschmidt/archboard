---
id: TASK-470
title: >-
  Main's hosted CI fails intermittently: macOS Git group cleanup, a React flush
  after teardown, rasterizer and variant browser cases
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-12 01:12'
updated_date: '2026-10-13 22:52'
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
- [x] #1 The Git lifecycle owner's macOS failure has a confirmed root cause and a fix in the product or the test that matches it
- [x] #2 The traffic-rest owner leaves no React work that outlives its DOM teardown
- [x] #3 Each rarer failure seen on main or branches in the last two days is either fixed at its cause or listed with its run ids as unexplained
- [ ] #4 At least five consecutive hosted full gates (Linux and macOS) pass on the fixes
- [x] #5 The complete local gate passes on the fixes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce each failure on hosted runners or locally, with diagnostics on throwaway flake-* branches. 2. Fix each at its owner: the product for a product race, the test for a test race. 3. Prove each on hosted macOS and Linux with repeated full gates, and run the complete local gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
macOS Git cleanup: a throwaway loop (branch flake-macos-git-diag, run 38190784827) printed the group at the failure. The stop barrier saw {owner 1706, sh 1707} stopped; right after the group SIGKILL the census held sh's new child 1710 (sleep 60) live, and 2, 4 ... 20 s later 1710 was still live with launchd as parent: the child forked while the group was being stopped escaped both group signals. TASK-362's 1 s to 3 s widening could never help. Fix: the barrier counts the group frozen only when two censuses one poll apart find the same members, all stopped (src/runtime/engine/lib/git-group-termination.ts; seam test in src/runtime/engine/tests/git-group-termination.test.ts fails before, passes after). Hosted macOS loop on the fix (branch flake-macos-git-fix, run 38191354610): 0 failures in 4 shards x (15 isolate runs + 10 x rerun-each 5), against 2 failures in one shard of the same loop before the fix.

macOS EPERM (run 37776895342, a different failure): the lifecycle owner failed in 23 ms with a raw 'kill() failed: EPERM'. The only unwrapped signal on that path is the Darwin census's null-signal probe of a group libproc lists empty (src/shared/process-observation/index.ts). EPERM there means the kernel still knows the group but reaches no member, as when the killed owner waits to be reaped. The probe now reads ESRCH and EPERM alike as no member that can run. Not verified on hosted macOS: the zombie-group probe job (branch flake-macos-git-ab-after) never started, see the billing note.

Linux modules lane 'window is not defined': each failing run (38148069388, 38153663557, 38185691095) prints 'An update to SemanticInspector inside a test was not wrapped in act(...)' during the last traffic-rest case. The pick opens the sidebar, whose inspector reads the board; answered after the case, it renders outside act and React's scheduled passive-effect flush runs after GlobalRegistrator.unregister removed window. One injected setTimeout(0) at the end of the case reproduces the exact error locally 3 of 3 times; with await settle() after the pick, 0 of 15 across five injected gaps.

Browser exploring owner (run 38150616626): 'Cannot read properties of null (reading getBoundingClientRect)' at column 213 of pick's script: drawnId read the picture once and every caller passed '' to pick. drawnId and pick in tests/system/browser/support/drilling.ts now wait for the subject within WAIT.

Not reproduced or explained (all on throwaway diagnostic branches running Bun 1.4.0 under the TASK-465 hang watchdog, which attaches gdb and strace to test processes): rasterizer 'real pixels...' (38178028512 gate-3, 38180803797 bun 1.4.0 gate 2; Chromium printed its DevTools socket, then 'The operation timed out'; the watchdog saw that Chromium in state D 8 s in); browser 'choosing a variant in the navigator...' (38178028512 gate-2, 38180803797 bun 1.4.0 gate 4; 30 s case timeout, no detail in the log). Neither has failed on main or on a Bun 1.4.3 gate.

Billing: from 01:21 UTC on 2026-10-12 GitHub refuses every hosted job on this private repository ('recent account payments have failed or your spending limit needs to be increased'): the A/B macOS loop (runs 38191583178, 38191581195) and a one-step Linux probe (run 38191870176) never started. The hosted full-gate proof waits on that.

Local gate: 'bun run check' on Bun 1.4.3 exited 0 twice on this branch, the second time on the final tree (all lanes, browser lane exitCode 0).

Main's own run 38188575539 attempt 3 (started before the billing block) went green on both jobs; attempt 1 was the macOS Git failure fixed here.

Still open, AC 4: branch flake-gate (the fixes plus a CI trigger on flake-* pushes) is pushed, and its run 38192895885 was refused for billing like every job since 01:21 UTC. Once billing allows jobs: rerun 38192895885 five times in a row (gh run rerun 38192895885, one attempt after another, since the CI concurrency group cancels a parallel one), and optionally rerun 38191583178 (after) and 38191581195 (before) for the larger macOS A/B loop and the zombie-group probe that confirms the EPERM reading.

Review: EPERM from the Darwin group probe also means a live member this process may not signal, and libproc answers an empty census on failure too, so the probe now counts EPERM as empty only when the full process census holds no live member of the group (src/shared/process-observation/index.ts). Not verified on macOS hardware. Open sibling, not fixed: Codex group cleanup (src/runtime/codex-process/lib/process-group-cleanup.ts drainKilledGroup, and terminateGroups in src/runtime/engine/server-startup-cleanup.ts) sends SIGKILL once and drains without signalling again, so a member forked during that SIGKILL can escape it the way the Git child did.

Raised SEMANTIC_RASTER_STARTUP_TIMEOUT_MS 10_000 -> 30_000 (applies per startup phase: launch/DevTools port, then renderer page). Hosted Linux cold starts exceeded 10 s in 2 of 5 gate runs (runs 38475307159, 38479273786). Test side: modules' tests cannot import tests/system/support/timing.ts (boundaries), so semantic-rasterizer/tests/cold-start-timing.ts holds TEST_CHROMIUM_COLD_START_CASE_MS = 45_000 (rasterizer.test.ts, theme-following.test.ts via setDefaultTimeout, which covers beforeAll too) and headless-chromium.test.ts carries its own COLD_START_CASE_MS = 45_000. Fast-failure tests (startup.test.ts exit 17, startup-cancellation, no-executable) never wait on the bound, so left on the product constant. Hosted behaviour not verifiable locally.
<!-- SECTION:NOTES:END -->
