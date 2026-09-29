---
id: TASK-377
title: Every vault board lays out within the 1 s render budget on both engines
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 18:33'
updated_date: '2026-09-29 19:03'
labels:
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 661000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured 2026-09-29 on a quiet machine (load 0.8), each drawing's first render in one warm process, two runs agreeing within a few percent: Agent workbench takes 1.37 s on Track and about 4.9 s on Blocks, Browser application 1.73 s on Blocks, Archboard server about 1.0 s on Blocks. Every other tracked board lays out in under 0.9 s. The boards grew with TASK-373's adoption. Track is the default engine, so the Agent workbench's 1.37 s is what a reader waits for today. Later renders of the same content are cache hits of a few milliseconds, so only a first render measures layout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every tracked vault board's first render takes under 1 s on Track and on Blocks, measured in one warm process on a quiet machine
- [ ] #2 No board's picture gets worse: the renderer's corpus tests pass and a before-and-after look at the changed boards shows the same or better drawing
- [ ] #3 A test or measured check owns the budget so a later regression is caught
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Profile first renders in-process (engine on the main thread, bun --cpu-prof-md) for Agent workbench on both engines and Browser application / Archboard server on Blocks: Graphviz, libavoid, and the track/blocks passes.
2. Fix causes that keep every picture identical: repeated work in the track engine's search, and the engine pool's scheduling of candidate solves.
3. Render every vault board variant and view on both engines before and after (242 SVGs) and diff; look at any drawing that changes.
4. Own the budget with a load-robust bound in the vault corpus test (wide-boards.test.ts).
5. Board proposals: none. The change moves no part or relationship any board draws (the Renderer layout and Semantic renderer boards name the worker pool, not how it dispatches).
6. Measure before/after on a quiet machine; run the gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
How the time was found: each engine ran in-process on the main thread under `bun --cpu-prof-md`. The profiled drawings were Agent workbench on both engines, and Browser application and Archboard server on Blocks.

Track, Agent workbench: the inline solve was the critical path, at about 970 ms. `Occupancy.along` in track/chains.ts used a quarter of it. It computed the narrowest stretch of every wall across the bands of a run again for each column that a search tried. Until a lane is taken, its answer stays the same, so it is now kept until `take`. The inline solve went from 970 ms to 600 ms.

Track, scheduling: when every worker was busy, the engine pool sent the solve to the least busy worker. So the group candidates waited behind the long inline solve, and the worker that the pool had just started stayed idle. Now a solve waits in the pool and goes to the first free worker (engine-pool.ts). The worker that answers never changed a drawing, because the engine memory is put back before every solve.

Blocks: the time is in libavoid, not in our passes or in Graphviz. For Agent workbench, 12.5 s of the 13.5 s of in-process solve time is inside `Router.processTransaction`. One render throws 744,136 C++ exceptions (`Avoid::UnsatisfiableException`). vpsc throws them and catches them again. `__throw_exception_with_stack_trace` uses 30% of the CPU. They come from the unifying nudging preprocessing step of libavoid (orthogonal.cpp, `nudgeOrthogonalRoutes` with `justUnifying`). That step tries every pair of free segments in a region as an equality. For each pair, it solves the whole region again. The costly solve is the joins candidate with all three blocks apart. It takes 3.8 s: 27 to 30 trunks run round the 4 packed blocks of 7TAwfrZF, and one route takes 0.9 s. That candidate is then rejected. No route repeats within a solve, so a memo gains nothing. Browser application and Archboard server throw no exceptions. There, each solve is 0.3 s to 1 s of libavoid routing with the crossing penalty. The critical path is a chain of dependent joins turns: three in a row for Browser application.

A tried change, not adopted: the trunk router with `performUnifyingNudgingPreprocessingStep` off. Agent workbench Blocks goes from 4.9 s to 0.9-1.2 s. Browser application goes from 1.7 s to 0.8-0.95 s. Archboard server goes from 1.0 s to 0.5-0.6 s. Track does not change, because its solves route no trunks. But 11 of the 242 drawings change, all on Blocks:

- Agent workbench: current, d74jhTtj, and view 3t0DNOAT
- Archboard server: nkFJIEAH
- Board viewer: hmI4YrBL, mbDAkbS0, qXLOZ2WR
- Browser application: IVTpHq7O and NdfNpTda, each also in view D87Mmg83

The scorecard is mixed. On the current Agent workbench, crossings go from 90 to 133 and shared ink gets worse (5 measures better, 7 worse). Board viewer hmI4YrBL is better on 10 of 11 measures. The D87Mmg83 views are 2 better and 5 worse. This change trades pictures for time, so it needs a decision.

Budget owner: wide-boards.test.ts times the first layout of each corpus board. Each case draws content that nothing drew before. The default engine must lay out within three times the 1 s budget. A bound at the budget fails on load in a shared gate: at load 3, Agent workbench Track took 0.98 s. The bound of three times fails a layout that got several times slower. Blocks is not held to it, because Blocks is over budget. The 1 s budget itself is measured on a quiet machine.

Pictures: every variant and view of every vault board was rendered on both engines before and after the change, which is 242 SVGs. All are byte-identical.

Timings: the first render in one warm process, after both engines were warmed on Codex session. The machine was quiet (load 1.7 to 1.95, no other `bun test`). There were two runs each, before and after:

- Agent workbench, Track: 1331 and 1392 ms before, 682 and 680 ms after
- Agent workbench, Blocks: 4925 and 4943 ms before, 4951 and 4912 ms after (over budget)
- Browser application, Track: 320 and 329 ms before, 278 and 276 ms after
- Browser application, Blocks: 1735 and 1734 ms before, 1699 and 1733 ms after (over budget)
- Archboard server, Track: 260 and 261 ms before, 230 and 232 ms after
- Archboard server, Blocks: 983 and 992 ms before, 984 and 997 ms after
- Every other board: under 450 ms on both engines, before and after
<!-- SECTION:NOTES:END -->
