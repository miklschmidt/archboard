---
id: TASK-252
title: A process census fails when it reads a process the kernel is releasing
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 10:57'
updated_date: '2026-09-17 11:03'
labels: []
dependencies: []
references:
  - src/shared/process-observation/lib/linux-stat.ts
  - TASK-168
ordinal: 439000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first run of the 2026-09-17 skill evaluation batch (S05 baseline rep 1) failed in setup: `archboard repo add` exited with "Incomplete process stat for pid 4079388". Every Linux census reads every /proc/<pid>/stat and throws on the first record it cannot parse. A task in state X (EXIT_DEAD) that release_task has already detached prints parent 0, process group -1 and session -1, and its /proc entry is gone a moment later. Group -1 fails the relationship validation, so one dying process anywhere on the machine fails the census, and with it every owned-process check that takes one (canvas ownership, Codex process groups, the evaluation harness). It is rare on a quiet machine and frequent under 32 concurrent evaluation runs; a churn of detached shell pipelines with late-reaped children reproduced it twice in 2.3 million reads, each record re-reading as ENOENT. The user stopped the batch until this is fixed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A stat record in state X whose process group is -1 reads as a process that has vanished, not as a parse failure, and a census skips it
- [x] #2 A record with group or parent -1 in any other state is still refused
- [x] #3 A unit test holds both, using the record shape the kernel printed
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first in observation.test.ts: the captured "X 0 -1 -1" record parses to undefined; "S" with -1 still throws. 2. parseLinuxProcessStat returns undefined for a released task (state X, pgid -1); readLinuxProcess already maps undefined to vanished. 3. Run the unit test, the process-group owners, then bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause confirmed: a churn of detached shell pipelines with late-reaped children produced two records like '4158493 (sleep) X 0 -1 -1 0 -1 ...' in 2.3M reads, each re-reading as ENOENT. parseLinuxProcessStat now returns undefined for state X with group -1, which readLinuxProcess already treats as vanished; any other -1 is still refused. After the fix the same churn ran 2246 whole-machine censuses with no failure. bun run check exit 0 (module 3182, system 163, repository 8, browser lanes pass).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A census now skips a process the kernel is releasing instead of failing on it; held by a unit test built from the record the kernel printed, confirmed under the reproducing churn, and bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
