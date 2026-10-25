---
id: TASK-520.05
title: The core lays out Blocks boards
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T07:45:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.04
  - TASK-520.02
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 925000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layout moves to Rust one engine at a time, each against the drawing geometry that the TypeScript stage answers as the oracle. This task ports the Blocks engine (shared/rules/blocks). Text measurement and Graphviz stay capabilities that the host gives the core through imports until TASK-520.07 and a later decision (ADR 0057). The corpus is every board whole, every view and every non-current variant of the dogfood vault and the vaults under examples/, under both engines and both themes, with and without the comparison.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The core answers the drawing of every corpus board that Blocks lays out, and the drawing is equal to what the TypeScript stage answered
- [ ] #2 Every corpus picture is the same bytes as before the change
- [ ] #3 The ported TypeScript rules are gone from packages/renderer
- [ ] #4 No corpus board renders slower, measured with the same harness before and after
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record every Blocks solve of the corpus from the TypeScript stage (input graph, each Graphviz call, the answer) under ARCHBOARD_RECORD_BLOCKS, with a temporary harness in layout-engine.ts.
2. Port the Blocks-only branches into crates/archboard-layout beside the Track ones (TS@7dd1846c1 holds both): frames as blocks, the cluster of loose cards, packing (pack, packings, slides, trunks routed by archboard-router inside Rust), settling with packings, held port orders, facing walls, lone widening.
3. Replay every recording through the crate with a stand-in Graphviz that answers the recorded answer and refuses a graph that is not byte-equal; iterate until every answer is equal.
4. One export for both engines: lay_out_board (wasm layOutBoard). routeTrunks and its flat array binding go. layout-engine.ts sends every solve to the core.
5. Delete the Blocks TypeScript the worker ran. Decide with evidence what the main thread keeps (solves.ts and the weighing it reads).
6. Render the corpus before and after (0 of N differ), time Blocks and Track with --jobs 1 before and after, run bun run check and the lanes it can hide.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence and decisions (implementer, 2026-10-25):

- Port: crates/archboard-layout lays every board out through one function, `lay_out_board(graph, &mut dyn Graphviz)`, for the nestings blocks, inline and groups. The Blocks branches of TS@7dd1846c1 joined the Track ones. New modules: blocks/nested.rs, blocks/orders.rs, blocks/packing/ (pack, packings, edges, slides, trunks, away, open_edge, port_columns) and blocks/choosing.rs. archboard-router routes the trunks inside the core, and the routeTrunks wasm export is gone. The wasm binding exports layOutBoard and the pure choice calls drawsBetter, readsBetterPacked, stacksOf, joiningOf and hasRegions.
- Replay: I recorded all 2,394 Blocks solves of the corpus from the TS stage, with every Graphviz call. The corpus was all variants, light, comparison on and off. A stand-in Graphviz replayed them through the crate and refused any graph that was not byte-equal to the recorded one. Every graph was byte-equal. Every answer was equal, with one exception. 325 TS answers carried `titles[].box.steps`, the header slot's wider sizes leaked into the title box. The main thread's PlacedSchema never read it, and the core does not write it.
- Corpus: `bun scripts/render-corpus.ts render ... --variants all --engines track,blocks --themes light,dark --comparison on,off --jobs 4` before (base cfdc1d607) and after: "0 of 36032 drawings differ". This held after the switch and again on the final tree (/tmp/blocks-after).
- Timing: `--variants current --themes light --comparison off --jobs 1`, three interleaved runs each side. Blocks took 9.15, 9.23 and 9.10 s before, and 7.91, 8.12 and 7.88 s after. 60 Blocks views were faster in every run, and 1 view went from 6 to 7 ms in every run. Track took 8.09, 8.19 and 8.17 s before, and 8.17, 8.08 and 8.06 s after. 10 Track views were faster and 9 slower in every run, by 1 to 2 ms. Other work kept the machine at a load average of about 6.
- Main thread (AC3): the choosing stays in TS (solves.ts, joins-laid.ts). It asks for solves side by side across the worker pool and cancels them, and every solve starts from Graphviz as loaded. One core call that held the choice must run the solves one after another, and they must share Graphviz memory. What the choosing weighs moved into the core. A solve asked with `archboard.blocks.read` tells `archboard.blocks.reading`, which the renderer passes back without reading it. With BlockTree gone from the main thread, nothing reaches shared/rules/track or the rest of shared/rules/blocks. I deleted all of it, about 17,800 lines.
- The solve stage option (`archboard.stage`, SOLVE_STAGE) and the layoutOptions parameter of a solve are gone. The root options of the graph name the nesting.
- roomNeeded: kept as is. It counts the distinct lanes in the gap between two neighbouring blocks after nudging. The router's crowding is a test of channel capacity during routing, a different number. Using it moves the packing gap.
- pinPoint keeps its plain-item difference. `roomy` is removed: settling lays a block of blocks again with `lay(Some(packing))`, which widens it.
- The two JSON.parse assertions in layout-engine.ts stay. A typed contract needs export-types.rs to export the root of the solve's answer and the Graphviz graph. That file is fenced for TASK-520.10.
- Copies: flows' pair_crossings now uses archboard_layout::pair_crossings. The flows copy of `reversed` stays, because hop-geometry.ts still uses its TS original (layout/routes/curves.ts).
- Tests: the unit tests of the removed TS rules moved into the crate (blocks/steps_tests.rs, track/score.rs, blocks/weighing.rs, track/label_runs.rs, track/clear.rs, blocks/lone.rs, tests/choosing.rs). tests/solve.rs (was tests/track.rs) lays two containers out inline, with groups and as blocks through the interface. join-candidates.test.ts fakes a reading for its stand-in answers.
<!-- SECTION:NOTES:END -->
