---
id: TASK-548.04
title: >-
  The core's own layout of a solve gets faster, along the critical path of a
  first render
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T04:38:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 937000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Half of every solve's CPU is the core's own layout (Blocks and Track in crates/archboard-layout, the router in crates/archboard-router), measured on feat/rust-desktop-frontend: 9.9 s of 20.3 s solve CPU over the 23 first renders of timing.ts. A first render waits on its longest chain of solves: Agent workbench took 1,791 ms with a longest single solve of 866 ms, and adding threads beyond 4 gained about 14% (spike/wasm-threads). So the time to remove is on the critical path: the solves a choice must wait for, one after another, and the core work inside each.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/design records the critical path of the slowest first renders: which solves run one after another, and how each splits between Graphviz and the core's layout
- [x] #2 Every drawing of the corpus is unchanged
- [x] #3 The first-render total of timing.ts falls, measured against the commit before the change on the same machine
- [x] #4 The renderer's focused tests (bun test packages/renderer) and cargo test for the changed crates pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record every solve of the 23 timing.ts first renders (capture-solves.ts): graph, Graphviz calls and answers, times, and the critical path on a clock where every solve has its own worker.
2. Replay those solves natively without Graphviz (cargo example replay.rs), holding each to its recorded answer byte for byte, and profile the core with perf.
3. Measured critical path (baseline e84d2c488): on every slow board it is the inline stacking choice: two partial solves (until-stood), then one whole solve with the chosen stacking, which repeats the partial's work.
4. Choice structure: ask the whole solve laid each way beside the partial solves, one turn after the solves the render needs, and call off the one not chosen. A board whose graph shows that no block could stack asks one solve. Two whole solves in place of the partial solves was measured and rejected, because some boards got slower.
5. Core: cut repeated work in the relay and routing hot spots (crossings, by-band lookups, wall stretches, occupancy, allocation). The replay holds each change to the same answers, and the corpus to 0 of 2,344 drawings changed.
6. Record the critical path, the split, the hot spots, each change and its gain in docs/design/first-render-critical-path.md. Time timing.ts against e84d2c488, alternating. Run the focused gates.
No board's meaning changes: this changes how the layout solves run, not what the parts are.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No board's meaning changes. This work changes how the layout solves run and how cheaply the core routes, not what any part, relationship or binding is.

Critical path (capture-solves.ts, one worker per solve, base e84d2c488): on every slow board it was the stacking choice, a partial solve then the whole solve it chose. Agent workbench 461 + 856 ms = 1318 ms, Board viewer 685 + 818 ms = 1503 ms. Graphviz is about 65% of the whole solve: the stack prefix and 8 or 9 sequential wrap sink checks of 35 to 53 ms each.

Decisions:
- The whole solve laid each way is asked beside the partial solves, one turn after the solves the render needs, and the one not chosen is called off. Asked at once, they took workers from needed solves and made Agent workbench slower in the pool.
- Two whole solves in place of the partials (option A) was rejected: Archboard server routes 506 to 1150 ms, Board persistence 795 to 1155, Browser application 702 to 1510 ms.
- Core: dense ByBand, relay crossings counted once, wall stretches cached per band, take_all, walls known by number. Native replay 7.24 s to 5.47 s.
- The engine pool, the wasm crate, the Graphviz trait, solving.rs and viz.rs were not changed (TASK-548.01's scope).

Evidence:
- Corpus: bun scripts/render-corpus.ts render /tmp/t548/04-after --variants current --jobs 1, then compare with /tmp/t548/base: 0 of 2344 drawings differ. No drawing changed, so the owner's waiver was not used.
- Critical path total of 23 boards 9226 to 5215 ms. Solve CPU 18859 to 25623 ms (upper bound: the capture runs called-off solves to the end).
- timing.ts 7, alternating, load 5.4 to 6.7: first total base 10179, 10426 ms, after 8722, 8289 ms. Again totals 385 to 393 ms on both. Agent workbench 1686, 1733 to 1572, 1588 ms. Board viewer 1548, 1547 to 1208, 1065 ms. Archboard 489, 495 to 533, 540 ms (slower, not traced).
- bun test packages/renderer: 651 pass, 1 skip, 0 fail. cargo test and clippy -D warnings for archboard-layout, archboard-render, archboard-router pass. type-check, lint, fmt:check pass. bun run benchmark: 40 pass.

The 500 ms target is not reached. What stands in the way: Graphviz in the whole solve's stack prefix and wrap sink checks, and the pool's cold start and contention. docs/design/first-render-critical-path.md names the changes that could reach it: wrap candidates as their own solves, faster and shared Graphviz (TASK-548.01 to 548.03), and a warm pool.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The stacking choice no longer waits for a partial solve and then a whole solve in a row: the whole solve laid each way is asked beside the partial solves, and the one not chosen is called off. Track's routing in the core is 24.5% cheaper in native replay. The critical path total of the 23 timing.ts boards fell from 9226 to 5215 ms, and the timing.ts first total from 10179 and 10426 ms to 8722 and 8289 ms. Every drawing is unchanged (0 of 2344 differ). docs/design/first-render-critical-path.md records the measurements and the capture and replay tools.

Risks and follow-ups: the speculated whole solves cost more CPU, and Archboard got about 45 ms slower. Agent workbench (about 1.6 s in the pool) and Board viewer (1.1 to 1.2 s) are still over the 500 ms target. Graphviz in the whole solve and the pool's cold start stand in the way. The document names the changes that could reach the target.
<!-- SECTION:FINAL_SUMMARY:END -->
