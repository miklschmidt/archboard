---
id: TASK-454
title: Keep wide block layouts within the normal test budget
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 14:52'
updated_date: '2026-10-11 15:14'
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
- [ ] #1 The exact failing wide-board owner passes within its unchanged 60-second budget on hosted Linux.
- [ ] #2 Every wide-board assertion and layout contract remains intact.
- [ ] #3 The complete local and hosted gates pass without weakening selection, timeouts, assertions, or validation policy.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the exact hosted timeout and reproduce the same Browser application blocks owner on Linux. 2. Measure native layout work and worker scheduling, then change one proven cause. 3. Keep the layout output, every visual assertion, and both source and normal timeout contracts. 4. Run remaining lanes, scoped Standards/Spec review, and complete local and hosted gates. No board is affected if the repair only removes redundant internal computation and keeps the renderer architecture and output. Reassess if a module or relationship changes.

Affected proposals: Renderer layout@TASK-454 and Semantic renderer@TASK-454. Preserve parallel solves and selection order. Add an optional AbortSignal to the host solve contract. Cancel only obsolete queued candidates when an accepted join choice changes future candidates. Active solves finish normally. Add focused cancellation and join-selection regression owners. Compare final geometry and retain all wide-board assertions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The exact hosted case failed at 60021 ms. Local profiling measured 12 solves and 40 seconds of native work. Seven needed solves took 27 seconds in sequence, but removing parallel speculation exceeded the normal local 20-second case limit. Repeated routing and eager exception messages did not explain the delay.

The one-worker native probe now runs eight solves in 30.7 seconds instead of 12 solves in 40.2 seconds. Its SVG matches the baseline byte for byte. The unchanged Browser application blocks case passes locally in 13.9 seconds. All 39 wide-board and solve-history cases pass. Footprints use ea936206, immediately before the first repair code commit. Both Renderer core directory bindings include the changed implementation. Their responsibilities and module relationships remain true. Block engine binds its unchanged entrypoint, while the implemented selection change lives in its private blocks/joins.ts and blocks/solves.ts files. The proposal describes that built behavior. Code findings match the baseline, including the existing unrelated Board rasterizer drawRequest warning.
<!-- SECTION:NOTES:END -->
