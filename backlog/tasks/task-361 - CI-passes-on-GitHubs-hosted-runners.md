---
id: TASK-361
title: CI passes on GitHub's hosted runners
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-28 17:48'
updated_date: '2026-09-28 18:07'
labels:
  - ci
dependencies: []
priority: high
type: bug
ordinal: 602000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI has failed on every push to main since 2026-09-20 (gh run list --repo miklschmidt/archboard). In run 36459326838 (2026-09-28) the Linux job's hosted checks failed with 'what one capture is > real pixels of the renderer's picture, at one bitmap pixel per diagram pixel' timing out after Bun's default 5000 ms, twice; the macOS job failed 'process observation > reads the current process through the native platform boundary' in 4 ms, which is not a timeout. The user reports many timeout failures and expects GitHub's runners, whose performance varies widely, to need about three times the default timeouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The failures of the recent failed CI runs are classified as timeout or real, with the evidence for each
- [x] #2 Test timeouts that fail only because of runner speed are raised, about three times their current value, where the repository sets them (bunfig, per-test and lane timeouts, CI step timeouts), without hiding a real failure
- [ ] #3 Real failures, including the macOS process observation test, are fixed or tracked with their cause
- [ ] #4 A push of the change turns CI green on both jobs, or the remaining failure is named with its cause
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Classify every failure in the failed runs since 2026-09-09 (run logs of failed jobs) as timeout or real, with the log line. 2. Add one test patience factor (3) to tests/system/support/timing.ts; the bunfig preload installs 3 x Bun's own 5 s per-case default through setDefaultTimeout and the unapproved wall-clock budget becomes 3 x 20 s. Product timing in src/shared/timing/timing.ts stays. 3. Codex lifecycle fake-clock bounds on macOS (group gone within TERM grace + 1 poll, seen at +3 polls): give the OS a real poll interval per driven fake poll and allow the factor in polls. 4. macOS process observation: observe a detached group the test spawns and owns instead of the runner's inherited group, which on the hosted macOS image holds a process libproc will not describe. 5. File a Backlog bug for the one-off macOS source-control cleanup deadline overrun. 6. Run the CI lanes locally one at a time under a memory cap, and under a one-CPU quota to find other cases within 3x of their bound; raise only those. 7. Update docs/agents/test-suite.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Classification of every failure in the failed CI runs from 2026-09-09 to 2026-09-28 (logs of runs 36459326838, 36438808924, 36409129993, 35842968612, 35587589096, 35586370915, 35585821833, 35506245950, 34371079564):
- TIMEOUT, Linux, runs 35506245950, 35842968612, 36409129993, 36438808924, 36459326838: 'what one capture is > real pixels of the renderer's picture, at one bitmap pixel per diagram pixel' timed out after Bun's default 5000 ms (5000.15 to 5018.74 ms). It is the first Chromium cold start of src/runtime/semantic-rasterizer/tests/rasterizer.test.ts; it takes 0.7 s here. The 'could not start' errors after it are the cancellation of that start. Because test:modules failed, test:system and test:repository have not run on a hosted runner since 2026-09-20.
- REAL, macOS, all nine runs: 'process observation > reads the current process through the native platform boundary' failed in 1.3 to 5.7 ms with 'Darwin listed pid N in process group G but refused its process information'. The test observed the group it was started in, not one it owns. The refused member is always 17 or 18 pids above the group leader, so it is a process of the runner's job, started before the tests; libproc will not describe it (most likely another user's process: PROC_PIDTBSDINFO checks same user). The product only observes groups it spawned detached.
- TIMEOUT (fake clock), macOS, runs 35586370915, 35587589096 and 35842968612: two Codex process lifecycle cases expected the killed group gone within TERM grace + one 10 ms poll and saw + 3 polls (Received 5030, Expected <= 5010). The driver gave the OS one event-loop turn per fake poll, so it measured kernel kill latency in event-loop turns.
- TIMEOUT (product deadline), macOS, run 35587589096 only: the source-control lifecycle case in src/runtime/engine/tests failed after 1082 ms with 'cleanup failed after output: the detached process group remained live'; the product's 1000 ms group-cleanup window expired. Filed as TASK-362; product timing left alone.
- REAL, fixed since: fmt:check on src/ui/pane-session/use-pane-session.ts (runs 35585821833, 35586370915, 35587589096); ten skill-evaluation files failing to load the evals suite ('a skill package must not carry an evaluation's names', runs 35506245950, 35842968612); src/runtime/semantic-renderer/tests/wide-boards.test.ts 'the vault board Agent workbench.semantic.json does not parse' (run 35842968612). None recur in the three latest runs.

Changes. One patience factor, TEST_PATIENCE_FACTOR = 3 in tests/system/support/timing.ts. The bunfig preload now calls setDefaultTimeout(TEST_CASE_TIMEOUT_MS = 3 x Bun's 5000 ms = 15000 ms), so every case without its own bound waits 15 s (proved: a 6 s case passes with the preload and times out at 5000 ms without it). The unapproved wall-clock budget TEST_WALL_CLOCK_BUDGET_MS went 20000 -> 60000 ms, because with Bun's bound raised it is the next thing a slow runner trips. Explicit case bounds under 20 s were tripled: board-lock-announcements, board-lock-lease, the stalled-reader source-control case and both application-lifetime-terminal-stop cases 10000 -> 30000; board-claim, walkthrough-recording-start and codex-pane-context 15000 -> 45000; the source-control lifecycle case bound 2 x -> 3 x 2 x the command timeout (10000 -> 30000). Module tests under src cannot import tests/system (docs/agents/boundaries.md), so those carry the literal. Bounds of 20 s and above already cleared hosted runs (last green run's slowest case 11.5 s) and stay. CI job caps stay: the Linux job takes 4 to 5 minutes of its 30, the macOS job under a minute of its 10. Product timing is unchanged.
Codex lifecycle fake clock: driveManual with yieldToProcessEvents now sleeps one real PROCESS_GROUP_OBSERVATION_POLL_MS per driven poll instead of one event-loop turn, and the two bounds allow KILLED_GROUP_EXIT_POLLS = 3 polls after the kill instead of one.
macOS observation: the test now observes a detached group it spawns and owns (exactly its leader), which is the only kind of group the product observes; renamed to say so. Product observer unchanged: failing closed on an unreadable member of an owned group is right.
Removed 26 exports from tests/system/support/timing.ts that nothing imported.
Also found: tests/system/cli/install-targets.test.ts 'a manual whose links resolve' fails because INSTALL.md links TESTING.md#5-a-first-session (a6c71c6f); the coordinator is fixing that on main, so it was left alone here.
Local lanes, one at a time under an 8 GB memory cap: lint 0, fmt:check 0, type-check 0, test:modules 0 (3702 pass; again 3702 pass under a 2-CPU quota, slowest case 5.0 s), test:system with the CI env 1 (179 pass, 1 skip, 1 fail: the install-targets link above), test:repository 0 (8 pass), test:serial-browser with the CI exclusion 0, the macOS job's command on Linux 0 (69 pass). AC3 and AC4 need the pushed run: the macOS fix can only be proved on the macOS job.
<!-- SECTION:NOTES:END -->
