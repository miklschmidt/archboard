---
id: TASK-377
title: Every vault board lays out within the 1 s render budget on both engines
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 18:33'
updated_date: '2026-10-17 08:04'
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

7. (2026-10-17) Profile the three failing wide-board cases in-process; take libavoid's UnsatisfiableException throw out of vpsc at instantiation (same as the catch); weigh the joins choice on every answer so later turns' follow-ups are laid out beside a long turn; speed Track's lane searches without changing what they answer; render both vaults on both engines before and after and look at every changed drawing.
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

User decision 2026-09-30: accept Blocks over the budget for now. Track, the default engine, lays out every tracked board within 1 s after 5779892f and 14afc56f (Agent workbench 0.74 s, re-measured on a quiet machine after the merge). Blocks stays over: Agent workbench about 4.9 s, Browser application about 1.7 s, Archboard server about 1.0 s, almost all inside libavoid's routing. The task stays open for Blocks; switching off libavoid's unifying nudging step was measured and rejected because it makes some drawings worse.

TASK-420 closure decision on 2026-10-07 keeps its existing Blocks speed issue here. The eighteen-board audit records Board viewer at 2109.20 ms on Blocks and 650.60 ms on Track. Board viewer is the only current drawing over one second in that audit. The owner accepted the spacing fix and kept this task open for the Blocks budget. Audit log: /tmp/surface-render-budget.log.

2026-10-16, after TASK-482 nested every crowded vault board: three wide-board cases in tests/…/wide-boards.test.ts fail their bound on a quiet machine. Archboard server routes (blocks) and Command interface (blocks) pass the 20 s case limit (Archboard server routes took 6.5 s before the nesting and 23.8 s after, timed alone); Board viewer (track) takes 3.3 to 3.9 s against its 3 s bound. Agent workbench (blocks) went from 10.1 s to 21.0 s. The owner wants these drawings fast, not the limits raised; this task owns the work.

2026-10-17, the three failing wide-board cases. Each engine was profiled in-process on the main thread (bun --cpu-prof-md).

Profile findings:
- Blocks: half of every solve was libavoid's unifying nudging throwing Avoid::UnsatisfiableException out of vpsc (findMinLMBetween, inlined in IncSolver::satisfy). The catch only marks the constraint unsatisfiable. Each throw went through the engine's JavaScript, and JSC captured a stack for each one. With BUN_JSC_exceptionStackTraceLimit=0, a solve took half the time.
- Blocks, scheduling: the joins choice asked for the next layouts only after the turn it waited for answered, so a long turn held back the follow-ups of later turns that had already come.
- Track, Board viewer: the inline solve was the critical path at about 2.65 to 2.8 s. Graphviz took 30% (16 calls), and routing took 65%, spread over relayLaps, the label straightening, partCollinear and straightenLanes. Occupancy.fits ran 195,000 times a solve against about 270 stretches each.
- Still over 1 s on Blocks: the all-apart joins candidate of a packed cluster. In Archboard server routes, one libavoid route of 53 trunks takes 11.6 s of a 15.6 s solve. Unifying nudging solves the region again for every pair of free segments (orthogonal.cpp, the justUnifying loop). The work is libavoid's, so AC1 stays out of reach on Blocks.

Fixes:
1. lib/unsatisfiable.ts: as the engine instantiates libavoid-js 0.5.0-beta.5, it edits the throwing branch to mark the constraint as the catch does. It checks the length and FNV-1a hash of the build and refuses any other build (engine.ts, NOTICE.md).
2. lib/blocks/joins-laid.ts: every answer that comes is weighed in the sequential order, and every layout that order reads next is asked for at once. Layouts that no turn reads any more are called off. joins.ts keeps the weighing.
3. Graphviz answers in json0, which is json without the drawing operations that nothing reads. The once-cache keeps the text, and each caller parses its own copy. Graphviz time went down by about 14%, with identical boxes and polylines.
4. Track lane searches: Occupancy.fitting reads a run's bands and frames once for a search (scene.keepsFrames answers a test, and track/clear.ts merges the stretches after 8 asks). Other changes: cheap tests first in parting.collinear, per-card grouping in jogs.cardStepKeys, and precomputed pair meets in straighten.crossingsFor. Test: tests/lane-clear.test.ts.

Corpus (every variant and view, both engines; frozen snapshot against base f8f020cf2): this vault has 11360 SVGs, and 2 differ. That is one drawing, Live panes Pane connections (Blocks) in TASK-482.06 and TASK-482.07, moved by the libavoid edit through heap-address ties. It was looked at and reads better: 16 crossings instead of 22. Docs-Architecture-Design has 3370 SVGs, and 0 differ.

First renders, one warm process, each board's current variant, base then after, two runs each:
- Track (load 1.5 to 2.8): total 16.8 s and 16.8 s before, 13.0 s and 13.1 s after. Board viewer 3.51 s and 3.47 s before, 2.57 s and 2.58 s after. Agent workbench 2.39 s to 1.95 s. Every other board is under 1.6 s.
- Blocks (load 2.1 to 4.6): total 188.2 s and 188.5 s before, 50.6 s and 49.9 s after. Board viewer 24.1 s to 5.6 to 5.8 s. Archboard server routes 75 s to 16.2 s. Command interface 30.5 s to 9.0 s. Agent workbench 15.6 s to 4.6 s. Browser application 15.1 s to 4.9 s. Board persistence 11.0 s to 3.3 s.
- wide-boards.test.ts at load 1.2 to 2.4: 40 of 40 pass. Archboard server routes (blocks) takes 16.3 s, Command interface (blocks) 8.8 s, and Board viewer (track) 2.66 s.

Gate: bun test src/runtime/semantic-renderer src/transformers/semantic-renderer gives 662 pass and 0 fail. bun run lint, tsc and oxfmt are clean. No bound was raised.

Tried and not adopted: forcing Track's stacking choice in two parallel solves. It would take Board viewer (track) to about 1.7 s, but it rewrites the stacking choice that TASK-486 is changing.

2026-10-17, round two: AC1 on Track. Base is feat/derived-overview at 54cb1f168, with TASK-486's turnsRoundOf weighing in.

Stacking choice laid out side by side (lib/blocks/stacking.ts, place.ts, solves.ts):
- The choice moved unchanged from place.ts into stacking.ts. `stoodOf` gives what each way stood at: score and fit with titles tied and settled, line length, and weighedLaid of the settled layout, turnsRoundOf included. `stacks` makes the choice from two Stood values, and the in-solve choice uses the same function.
- A Track solve with every join before its labels (`apart` empty) asks four solves. Two lay the first block that could stack one way each and answer what it stood at once it is laid (`archboard.blocks.until-stood`). Two lay the whole board each way. Once both have told, the renderer keeps the whole solve that `stacks` chooses and calls the other off where it still waits.
- A board with no block that could stack is drawn by the told solves, which then lay it whole.
- First version and why it changed: two forced whole solves only. The loser's continuation could be long. Archboard server routes inline took 1.76 s laid the losing way, against 0.5 s laid the chosen way.
- Turns of the joins choice stay single solves. Splitting them too had them wait for the cores: Agent workbench took 1.64 s and 1.72 s against 1.50 s and 1.54 s.

Relay search (track/relay.ts, sweep.ts): `cheapest` and `fromReach` use loops instead of Float64Array.map closures. The arithmetic is the same.

Corpus (every variant and view, both engines, frozen snapshot against 54cb1f168): this vault has 11360 SVGs and Docs-Architecture-Design has 3370. 0 differ in either.

Gate: renderer tests 665 pass and 0 fail. lint, tsc and oxfmt are clean. wide-boards passes 40 of 40. No bound was raised.

Track first renders, warm process, base then after, two runs each (load 2.8 to 4.4, other agents running):
- Total 13.07 s and 13.00 s before, 10.88 s and 10.66 s after.
- Board viewer: 2.58 s and 2.56 s before, 1.55 s and 1.63 s after.
- Board persistence: 1.29 s to 0.80 s. Browser application: 1.19 s to 0.79 s. Live panes: 1.26 s to 0.82 s.
- Agent workbench: 1.96 s and 1.99 s before, 2.08 s and 2.06 s after. It is the first board in the run, so its solves start the workers the pool grows into, and those workers run the router cold. After one warm-up board (Board persistence), Agent workbench takes 1.78 s and 1.76 s before, 1.50 s and 1.47 s after. Board viewer takes 2.64 s and 2.58 s before, 1.43 s and 1.41 s after.
- Archboard server routes: 0.92 s before, 1.34 s and 1.09 s after when it is second in the run. With the pool grown first, it takes 0.89 s and 0.92 s.

Still over 1 s on Track:
- Board viewer, about 1.45 s. The critical path is the plain whole solve: three lays, the untied lay, and the wrap check, which asks Graphviz 8 times for wraps that all sink (380 ms). The stacked path is four lays of about 300 ms each. Routing is about 75% of a lay: relayLaps about 37% (DP over about 1100 columns and 15 stations for each of 491 readings), partAndClose 20%, label straightening 15%, lane straightening 14%. Graphviz is the rest.
- Agent workbench, about 1.5 s. The critical path is the groups turns of the joins choice. About ten solves run at once, and each takes about twice its in-process time.
- What remains would lay the remedies (pullLeaving, anchorLabels) side by side in the same way: about 8 solves for each candidate. It would trade more CPU for each lay. On this machine the CPU is already the limit.

Blocks first renders, same runs (load 4.4 to 5.5): total 48.6 s and 50.4 s before, 49.0 s and 49.3 s after. Archboard server routes 15.4 s, Command interface 8.6 to 8.8 s, Board viewer 5.9 s, Browser application 4.9 s, Agent workbench 4.5 s, Board persistence 3.3 s, Live panes 1.8 s, Archboard server 1.1 s, Voice coordinator 1.0 s. Every other board is under 1 s.

2026-10-17, round three: Board viewer and Agent workbench on Track without spending more CPU. No code changed. Both boards stay over 1 s.

What was tried, measured against c77cc3204:
1. The wrap check (8 Graphviz calls for wraps that all sink, about 380 ms on Board viewer's plain path). Whether a wrap sinks depends on where Graphviz and the lining up stand each lowered card across its row (sinks() compares x overlaps). So no sink is known before the layout. The 8 graphs differ from each other and from every layout laid later, so nothing is reused. Asking them at once would take solves of their own that repeat the stacking prefix, which costs more CPU.
2. The relay search. An exact bound that skips columns cannot do better than the route the search finds. Even that ideal bound would skip only 27% of the columns (391,727 of 536,861 kept across 491 readings of one Board viewer solve), because a crossing is worth 25 lanes and the window stays wide. The search is about 45% of the relay pass, and the relay pass is about 37% of routing, so the gain is at most about 4% of a layout.
3. Pool growth. A worker starts and answers its first tiny solve in 67 ms alone, and 12 started at once answer in about 165 ms each. Starting one worker for each waiting solve made the first board slower: Agent workbench took 2.91 s and 2.97 s against 2.07 s and 2.03 s. The first board's cost is the router running cold in each new worker, and more workers spread the solves over more cold ones. Starting every worker when the pool starts costs about 40 to 50 MB a worker: process RSS went from 214 MB with one worker to 775 MB as about 14 started. That is about 1 GB idle for 23, and the router would still be cold.

Critical path after this round (unchanged from round two):
- Board viewer, Track, about 1.45 s. Two solves bound it, each about 1.15 s in-process. The first is the told stacked solve: tied, pullLeaving, anchorLabels and untied layouts of the root, four layouts of about 300 ms each in sequence. The second is the whole plain solve: three layouts and the untied one (about 760 ms), then the wrap check (about 380 ms). Measuring and painting outside the solves adds about 250 ms. A layout is about 75% routing (relay pass about 37%, partAndClose 20%, label straightening 15%, lane straightening 14%) and about 25% Graphviz.
- Agent workbench, Track, about 1.5 s after a warm-up board (about 2.05 s as the first board of a process). It is bound by the groups turns of the joins choice. About ten solves run at once, and each takes about twice its in-process time.

Timings at c77cc3204, Track, warm process, two runs (load 1.6 to 4.9): total 10.35 s and 10.51 s. Board viewer 1.49 s and 1.73 s, Agent workbench (first board) 2.07 s and 2.03 s, Archboard server routes 1.10 s and 1.14 s (second board, workers starting). Every other board is under 1 s.
<!-- SECTION:NOTES:END -->
