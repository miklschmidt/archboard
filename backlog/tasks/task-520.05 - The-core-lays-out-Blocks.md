---
id: TASK-520.05
title: The core lays out Blocks boards
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T11:46:00Z'
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

## Board proposals (2026-10-25)

Renderer layout@TASK-520.05 (dvJFaR69) branched from TASK-520.04 at version 66 and was adopted at version 69. After adoption I changed two shared views (version 70) and corrected the order of one flow step (version 71). Semantic renderer@TASK-520.05 branched from TASK-520.10 (t7DPgM6B, adopted just before it) at version 110 and was adopted at version 115.

Renderer layout, each change checked against the code:
- Track layout (H0PF4BhI) is renamed Board layout, with the same id. Its interface is `lay_out_board(graph, &mut dyn Graphviz)` (crates/archboard-layout/src/blocks/place.rs:451) and the choice functions in lib.rs:22-25 (choosing.rs:229-353). The wasm binding exports them as layOutBoard, drawsBetter, readsBetterPacked, stacksOf, joiningOf and hasRegions (crates/archboard-renderer-wasm/src/layout.rs:48-107).
- Removed: Block placement, Card blocks, Block packing and Trunk router (qtwaBhit, Wp2usbe5, mkxpJuY7, skrvk25Y), whose files are deleted. Also removed: edges T4hTbGVM, fFiMvo56, luMz0TJo, JBISovVb and IDoV3QxP.
- PYJsIDYm now runs from Board layout to Orthogonal router, anchored at crates/archboard-layout/src/blocks/packing/trunks.rs `route`. trunks.rs:6 imports archboard_router::route.
- EGgs1DlZ is anchored at layout-engine.ts `layOutBoard`, labelled "lay out each solve, Track or Blocks".
- Layout engine (JwgvpLYJ) no longer mentions archboard.stage. It hands every solve to layOutBoard (layout-engine.ts:21-37).
- Block layout (tppVDaSZ) now only chooses between solves. Only block-engine.ts, solves.ts and joins-laid.ts are left. New edge Block layout -> Board layout (snykjpv6), "weigh the choices between solves", anchored at solves.ts `drawsBetter` (solves.ts:186-262 calls rendererHost().core() for each choice).
- Entry row (jLUi9ZuH) is rebound to crates/archboard-layout/src/blocks/holding.rs#entry_row_edges. Its old card_layout.rs binding had read BINDING_SYMBOL_MISSING since 78468e72a. The part is still Track only: only inline.rs:45 fills the entries.
- The flow "Lay out a drawing" is moved to the core. The stage decision is gone. Layout engine -> Board layout is `layOutBoard`, and the answer comes back from place.rs `lay_out_board`. Block layout asks Board layout `hasRegions` before any solve (solves.ts:257), `drawsBetter` where it keeps the best solve, and `readsBetterPacked` for the packed groups.
- The flow "Place the blocks" is moved to the core. Its participants are Board layout, Graphviz and Orthogonal router. Steps: pack a block of blocks (pack.rs `PackLayout`), route the trunks (trunks.rs `route`), rank the cards (card_layout.rs `render`), route on tracks (`routed`), weigh (place.rs `routed_weighed`) and keep the blocks unsettled when that scores better (place.rs `settled_or_not`, :271-287).
- Walkthrough beats FWMgjXxD and AOPSXwkc are rewritten: the core lays out every solve and weighs the drawings. Summary: "Measure, settle, route and paint: how a drawing is sized, laid out in the renderer core, chosen and handed to the painter".
- Sweep after the removal: the view "Block layout" now lists Block engine, Block layout, Layout engine, Compound graph, Board layout, Graphviz and Orthogonal router, with a new summary. The summary of the view "Engine and graph" no longer says "Blocks in TypeScript". `git grep` finds the removed part names only in code comments about the trunk router's rate, which is still true, and in history. archboard.stage remains only in historical variants and the ADR. ADR 0040 gets its dated note in commit 9029ac99f.

Semantic renderer:
- Layout engines (Y0smyqtZ): the core lays out every solve of either engine, and Blocks no longer runs in TypeScript.
- Renderer core (OEslPPbt) names layOutBoard and the five choice calls.
- 7I2XjJQ7 is anchored at layout-engine.ts `layOutBoard`, labelled "lay out every solve".
- New edge Layout engines -> Renderer core (SzqwsHRo), "weigh the choices between solves", anchored at solves.ts `readsBetterPacked`.

Corrected from the implementer's proposal:
- Md6tqK1p is removed, not re-anchored. Its source part, Card blocks, is gone, and S2sty0rs (Board layout -> Graphviz, card_layout.rs `render`) already draws that call.
- The flows' choice steps run from Block layout, not from Block engine: the choosing code is solves.ts and joins-laid.ts, not block-engine.ts.
- On Semantic renderer I added the choice-call edge. At first I anchored it at solves.ts `drawsBetter`, and the check answered `>` ANCHOR_MISMATCH: solves.ts:208 defines a local `drawsBetter` that is in neither end's code. I re-anchored it at `readsBetterPacked`, a direct call into the core.
- After adoption, the dark picture of "Layout sequence" showed hasRegions asked after drawsBetter. placedBlocks asks it first (solves.ts:257-258), so I moved the two steps before the solves on the adopted variant (version 71).

Code check (compared with and without `--variant TASK-520.05`): after the re-anchor, no `>` lines. 31 `<` lines: every ANCHOR_PATH_MISSING and ANCHOR_SYMBOL_MISSING of the removed parts, edges and steps (place.ts, card-layout.ts, pack.ts, trunks.ts, placeBlocks, layOutTrack, lay_out_track); 7I2XjJQ7's layOutTrack on Semantic renderer; and Entry row's BINDING_SYMBOL_MISSING. The four BINDING_PATH_MISSING warnings of `archboard check` cleared on adoption.

Footprint read against base 66a9c6263, the parent of cd997ea97, found with the trailer command. Range: cd997ea97, b28e7cd6b, 3fa8e2e4f (this task); 9029ac99f (this task and TASK-520.02, stale docs only); 43f84f0c4 (TASK-520.10 board).
- Renderer layout, current = TASK-520.04, the parent. namedAndChanged: Layout engine, Block layout, Board layout, and the removed Block placement, Card blocks, Block packing and Trunk router.
  - changedNotNamed: Block engine (cd997ea97 changed only its header comment to say the core lays each way out). It still asks for the solves and keeps the best, so the part is still right.
  - namedNotChanged: Entry row (binding corrected only; holding.rs is unchanged since the base) and Orthogonal router (named only by the moved relationship and steps). Both are expected.
- Semantic renderer, current = TASK-520.10, the parent. namedAndChanged: Renderer core. Layout engines is skipped as a drill-down into Renderer layout, which is read above.
  - changedNotNamed: Renderer host, Engine pool, Bun layout worker and Browser layout worker. cd997ea97 dropped the layoutOptions parameter of a solve (`solve(graph, signal)`) and added the choice calls to the core type the host provides (host.ts CorePainter). The relationships and responsibilities drawn stay true.

archboard check: no diagnostics. Behind (check --code), the boards this task's commits put behind: only Archboard's "Workspace packages" and "renderer" containers, whose descriptions are still right. Renderer layout and Semantic renderer read 0 commits behind.

Pictures (dark): Renderer layout Responsibilities against TASK-520.04 shows the four parts and their edges drawn as removed, Board layout changed and the new choice edge added. The Block layout view, the Layout sequence and the Place the blocks sequence read cleanly, and the Place the blocks sequence has only the core, Graphviz and the router as participants. The Semantic renderer "Layout and measuring" view against TASK-520.10 shows Layout engines changed. Renderer core is not in that view, so its two edges show only on the overview.
<!-- SECTION:NOTES:END -->
