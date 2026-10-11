---
id: TASK-464
title: Keep wide block layouts within the normal test budget
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 14:52'
updated_date: '2026-10-11 21:30'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/38148069388'
priority: high
type: bug
ordinal: 735000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hosted run 38148069388 at c80c70d6 times out rendering Browser application with the blocks engine. Other wide board cases take tens of seconds. The normal module lane fails before later owners run. Restore deterministic completion by fixing the measured renderer cost.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every wide-board assertion and layout contract remains intact.
- [ ] #2 The complete local and hosted gates pass without weakening selection, timeouts, assertions, or validation policy.
- [ ] #3 The exact failing wide-board owner passes within its 120-second budget on hosted Linux. The user approved 120 s for the two heavy Blocks cases because hosted GitHub Actions runners are much slower than local machines.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the exact hosted timeout and reproduce the same Browser application blocks owner on Linux. 2. Measure native layout work and worker scheduling, then change one proven cause. 3. Keep the layout output, every visual assertion, and both source and normal timeout contracts. 4. Run remaining lanes, scoped Standards/Spec review, and complete local and hosted gates. No board is affected if the repair only removes redundant internal computation and keeps the renderer architecture and output. Reassess if a module or relationship changes.

Affected proposals: Renderer layout@TASK-464 and Semantic renderer@TASK-464. Preserve parallel solves and selection order. Add an optional AbortSignal to the host solve contract. Cancel only obsolete queued candidates when an accepted join choice changes future candidates. Active solves finish normally. Add focused cancellation and join-selection regression owners. Compare final geometry and retain all wide-board assertions.

The merged one-worker probe still runs eight solves, including an obsolete singleton promoted synchronously after the all-joins answer. Let a cancellable caller consume an answer before promoting cancellable queued speculation. Preserve FIFO order, active solve completion, worker lifetime, output bytes, and every existing assertion. The adopted renderer boards remain accurate because this changes only the existing private queue handoff, with no new module or relationship.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The exact hosted case failed at 60021 ms. Local profiling measured 12 solves and 40 seconds of native work. Seven needed solves took 27 seconds in sequence, but removing parallel speculation exceeded the normal local 20-second case limit. Repeated routing and eager exception messages did not explain the delay.

The one-worker native probe now runs eight solves in 30.7 seconds instead of 12 solves in 40.2 seconds. Its SVG matches the baseline byte for byte. The unchanged Browser application blocks case passes locally in 13.9 seconds. All 39 wide-board and solve-history cases pass. Footprints use ea936206, immediately before the first repair code commit. Both Renderer core directory bindings include the changed implementation. Their responsibilities and module relationships remain true. Block engine binds its unchanged entrypoint, while the implemented selection change lives in its private blocks/joins.ts and blocks/solves.ts files. The proposal describes that built behavior. Code findings match the baseline, including the existing unrelated Board rasterizer drawRequest warning.

Merged closing evidence uses origin/main at 68e7f0e as the branch base. Both renderer proposals retain their current parents. Code checks introduce zero findings against the 17-finding current baseline. Renderer core directory changes are internal candidate scheduling. Bun host changes are focused tests. Block engine entrypoint remains unchanged because its private joins and solves files implement the described selection change. No module relationship or layout contract changes.

Hosted Linux rerun 38153663557 job 114515280382 at the merged code head again reaches the unchanged 60000 ms Browser application blocks timeout. The earlier second hosted run passed this case. This run also reports an independent resize-owner failure before layout. The repair remains open, and the full hosted gate is not green. Retained log: /private/tmp/archboard-retro-hosted-linux-rerun.log. Investigate the merged port geometry cost before changing any existing contract.

The one-worker merged profile performs eight native solves in 30.46 seconds. Routing query instrumentation finds zero identical native transactions among 217 calls. This probe provides no evidence for a route cache. The isolated two-core Linux exact case passes in 47.28 seconds. A held-worker regression reproduces premature promotion of the obsolete candidate after the answered promise, before caller selection can abort it.

The merged handoff probe runs seven needed solves in 28.38 seconds instead of eight in 30.46 seconds. The SVG bytes match the merged baseline exactly. Review also repairs final fatal and stopped-worker refusal paths so caller cleanup can cancel queued speculation before promotion. The unchanged first retry remains immediate. Focused owners reproduce both failure-path races without the repair. A separate review covers browser MessagePort startup, FIFO order, and process lifetime. The full command-prefixed Chrome for Testing gate finishes all 19 browser owners and cleanup with exit zero. That run starts before this handoff patch. Final-source validation remains pending.

Integration with main 3581b9dd7 and bf0184d53: main had its own cancellation of the joins' ahead solves (one AbortController per batch, every solve asked ahead called off when a turn is kept, a called-off layout forgotten at once). The merge keeps this branch's design, which called off fewer solves and finished sooner: the pool's queued handoff, retries that refuse a solve already called off, and calling off only layouts no turn to come weighs, sharing an active one. It takes main's Joined type, the layJoined export and the joins-ahead unit owner, which now has a two-block and a three-block case. layingOnce drops the settled flag, because calling off a settled layout does nothing. Measured three times each with Bun 1.4.2, one layout worker (taskset -c 0,1) and 23 workers. Browser application blocks: main 8 solves of 12 asked, median 35.64 s; branch 7, 32.14 s; merge 7, 32.11 s. With all workers: main 11 solves, 16.61 s; branch 10, 15.61 s; merge 10, 15.57 s. Board viewer blocks with one worker: main 7 of 9, 20.72 s; branch and merge 6, 18.28 s and 18.47 s. With all workers each solves all 9 in about 10.5 s. Every SVG is the same bytes in every run. Main's 120 s TEST_HEAVY_BLOCKS_CASE_MS hosted deadline for the two heavy Blocks cases stays, with its wall-clock declaration, as the user approved. Its proposal variants were renamed to TASK-464 through semantic rename, which keeps TASK-454 as their former name.
<!-- SECTION:NOTES:END -->
