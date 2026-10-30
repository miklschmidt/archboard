---
id: TASK-520.04
title: The core lays out Track boards
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-26T13:13:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.03
documentation:
  - >-
    docs/adr/0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 924000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layout moves to Rust one engine at a time, each against the drawing geometry that the TypeScript stage answers as the oracle. This task ports the Track engine and the shared layout rules (shared/rules/layout, shared/rules/track). Text measurement and Graphviz stay capabilities that the host gives the core through imports until TASK-520.07 and a later decision (ADR 0057). The corpus is every board whole, every view and every non-current variant of the dogfood vault and the vaults under examples/, under both engines and both themes, with and without the comparison.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The core answers the drawing of every corpus board that Track lays out, and the drawing is equal to what the TypeScript stage answered
- [x] #2 Every corpus picture is the same bytes as before the change
- [x] #3 The ported TypeScript rules are gone from packages/renderer
- [x] #4 No corpus board renders slower, measured with the same harness before and after
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Port the Track solve to a new crate, crates/archboard-layout, in the exact float order of the TypeScript stage: the block tree, card blocks (Graphviz graph, line-up, placed block), the track router (shared/rules/track), wraps, folds, stacking, port settling, sides and the assembly.
2. Prove it with replays before wiring: every recorded track route and every recorded Track solve, with Graphviz inputs byte-equal and answers equal.
3. Export layOutTrack from crates/archboard-renderer-wasm through a GraphvizHost import. createLayoutEngine sends the track stage there.
4. Remove the TypeScript branches that only Track took. Keep what Blocks still calls, and list each kept duplicate.
5. Compare the corpus against /tmp/t52004/before, then run the timing render against /tmp/t52004/time-before.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Naming: shared/rules/track/scene calls a block's placement read back a Scene. CONTEXT.md now gives Scene to the output of the renderer core (ADR 0057), so the port names the Track structure otherwise.

The core answers every Track solve. `createLayoutEngine` sends the track stage to `layOutTrack` (crates/archboard-renderer-wasm/src/layout.rs). That binding satisfies the crate's `Graphviz` trait with the host's viz-js. The blocks stage stays on `placeBlocks`.

Interface of crates/archboard-layout: one function, `lay_out_track(graph, &mut dyn Graphviz) -> Result<String, String>`, and the trait `Graphviz`. Every module is private. The seam has two adapters: the wasm host adapter, and the stand-ins of crates/archboard-layout/tests/track.rs (a column-stacking Graphviz and a refusing one). Errors: an unreadable graph or options, a nesting of "blocks", and a refusal or unreadable answer from Graphviz.

Evidence:
- Replays: 643 and 1095 recorded Track solves, and 640 and 5148 recorded track routes, gave Graphviz byte-equal graphs and answered equal JSON.
- Corpus: `render-corpus compare /tmp/t52004/before /tmp/t52004/after2` answers 0 of 35560 drawings differ (both engines, both themes, comparison on and off).
- Timing (`--engines track --variants current --themes light --comparison off --jobs 1`): 12349 ms before, and 8126, 8163 and 8118 ms after in three runs.

Six views were 1 ms slower in every run. The before run is one sample, and the five sequence views among them do not run the Track solve:
- Board rasterizer, overview (TASK-478.01 after TASK-482.07)
- Command interface, Starting the server (TASK-509)
- Browser application, Restoring a workspace (TASK-482.07)
- Archboard server, Panes and claims (TASK-498)
- Archboard server, Health (TASK-498)
- Codex session, Requests from the child (TASK-482.07)

Module map after the change, main thread:
- blocks/tree: solves.ts, block-engine.ts, joins-laid.ts, joins.ts, weighing.ts, stacking.ts (stacks, StoodSchema)
- blocks/lines/away.ts, blocks/cards/laying.ts (lineLength), track/scene/score.ts
- the BlockTree: tree.ts, inline.ts, lone.ts, headers.ts, card.ts, cycles.ts, below.ts, wall-keys.ts, laid.ts

In a worker, the Rust crate runs Track, and placeBlocks runs Blocks with everything it calls.

Duplicates kept for Blocks, each also in the crate. Blocks calls them fine-grained from TypeScript, so no coarse call replaced them:
- blocks/tree: tree.ts, inline.ts, lone.ts, laid.ts, assembly.ts, weighing.ts, stacking.ts, headers.ts
- blocks/cards: card-layout.ts, clusters.ts, card-graph.ts, laying.ts, leaving.ts, anchors.ts, below.ts, cycles.ts, headers.ts, graphviz-once.ts
- blocks/folds: fold.ts, fold-layout.ts, wraps.ts, leaves.ts
- blocks/lines: steps.ts, spans.ts, away.ts
- blocks/packing: sides.ts, walls.ts, and the spread and facing helpers of port-columns.ts and settle.ts
- track/: scene, routes, channels and labels

Decisions:
- No coarse Rust call for Blocks (a `routeBlock` in place of CardLayout.routed). It needs the block tree and the TypeScript scene marshalled across the binding, and TASK-520.05 deletes both sides.
- Clusters in clusters.ts and the inline-cluster paths of card-layout.ts stay. Under Blocks a block holds no inline cluster, so these paths get empty input. TASK-520.05 removes them with the rest of the Blocks code.
- placeBlocks no longer reads archboard.blocks.nesting. solves.ts names the stage from the nesting, so a blocks solve is always nesting "blocks".
- The crate names the Track structure `Placement`, as the task's naming note asks.

Board proposals (closing steps 1 to 7, read against the code at 0255cbe59):

Adopted: Renderer layout@TASK-520.04 (variant KGKsTE6n, adopted at version 64; the shared views were then edited at version 65) and Semantic renderer@TASK-520.04 (variant GJtbsPFm, adopted at version 105). Both were branched from the current variant (TASK-520.02 gcpBze89, and TASK-520.06 SDuSi3Cg).

Renderer layout, changes and evidence:
- Added the part Track layout (H0PF4BhI, module), bound to crates/archboard-layout/src. lib.rs:20 re-exports lay_out_track, lib.rs:25 holds the trait Graphviz, and place.rs:284 defines lay_out_track. The binding is the crate's source directory, not place.rs: the part stands for the whole solve across the crate's modules. This follows the Renderer core (crates/archboard-renderer-wasm/src) and Sequence layout (crates/archboard-flows/src/sequence).
- Added Layout engine -> Track layout, "lay out a Track solve" (call), anchored at layout-engine.ts layOutTrack (layout-engine.ts:8 imports it, layout-engine.ts:40 calls it for stage "track").
- Added Track layout -> Graphviz, "rank and order the cards, through the host" (call). CORRECTED anchor: crates/archboard-layout/src/blocks/card_layout.rs render. Engine::render (card_layout.rs:64) calls the host's Graphviz::render at card_layout.rs:69. The proposed layout.rs GraphvizHost is code of neither end (it is the wasm binding), so the relationship's description names it instead.
- Rebound Entry row (jLUi9ZuH) to crates/archboard-layout/src/blocks/card_layout.rs, symbol entry_row_edges (defined at card_layout.rs:752, called at card_layout.rs:361 in CardLayout's build). Moved it into Track layout (parent), because the board cannot leave it in Block layout, the TypeScript blocks directory.
- CORRECTED c6EtTjBt: removed instead of moved. Card blocks no longer calls the entry row (69a9588bf removed the call and entry-row.ts). The Rust caller is CardLayout inside Track layout, which now holds Entry row, so a relationship from Track layout to its own child would only restate the containment. The flow "Place the blocks" also lost its two entry row steps (GR20PFCl, KaqU7Mos).
- T4hTbGVM (Layout engine -> Block placement, placeBlocks) is now labelled "lay out a Blocks solve". Block placement now reads "Lays every block of a Blocks solve out" and its description says Blocks only (place.ts:321 placeBlocks with no inline argument, place.ts:162 BlockTree with nesting "blocks").
- CORRECTED Layout engine: it is not narrowed to Blocks only, because it still dispatches both stages (layout-engine.ts:37-45). Its responsibility now says Track goes to the renderer core and Blocks to block placement, and its description says it hands Graphviz to the core as GraphvizHost (layout-engine.ts:23-35).
- Also changed (footprint): the Card blocks description now says Blocks only. The Block layout description says it runs only the Blocks solve in a worker, and that block-engine.ts, solves.ts and what they weigh still run on the main thread for both engines (docs/agents/boundaries.md; solves.ts:96 names stage "track" for every nesting other than "blocks").
- Flow "Lay out a drawing": the solve now branches on "Which stage does the solve name?". The track branch is Layout engine -> Track layout (layOutTrack), with the drawing back (place.rs lay_out_track). The blocks branch is the old YLfGDr8O/vLjbpvxS. In the regions branch, BglCgR5F and uVAAX22Y now go to Track layout, because the "groups" nesting is a track stage (solves.ts:96, solves.ts:269).
- Walkthrough beat FWMgjXxD now says the core lays out Track and TypeScript lays out Blocks, and names the orthogonal router in place of libavoid. Every beat names the view Responsibilities, which clears WALKTHROUGH_VIEW_MISSING.
- Views, after adoption: Engine and graph now shows Track layout, and Block layout no longer shows Entry row.
- Summary: "Measure, settle, route and paint: how a drawing is sized, laid out (Track in the renderer core, Blocks in TypeScript), its trunks routed and handed to the painter".

Semantic renderer, changes and evidence:
- Renderer core (OEslPPbt) responsibility: "...it lays out every sequence, flowchart and Track solve and paints every picture". Its description names layOutTrack (crates/archboard-renderer-wasm/src/layout.rs:42-45) and GraphvizHost (layout.rs:13, layout.rs:21-22). It now says only text and the Blocks layout are still to move.
- Added Layout engines -> Renderer core, "lay out a Track solve" (call), anchored at layout-engine.ts layOutTrack. Its description says the call is made from inside a layout worker. Layout engines already carries anchors in layout code beyond engines.ts (F5mgUBCT at solves.ts), and no part of this board binds layout-engine.ts.
- The Layout engines description now says the renderer core lays out every Track solve and Blocks runs in TypeScript.
- Summary kept: "Meaning to a scene, its SVG and interaction geometry".

Code check, diff method (`findings` against `findings --variant TASK-520.04`): no `>` line. The `<` lines (cleared):
- ANCHOR_PATH_MISSING Renderer layout flows.KBB38tYG.steps.KaqU7Mos (entry-row.ts)
- ANCHOR_SYMBOL_MISSING Renderer layout edges.c6EtTjBt (entryRowEdges in card-layout.ts)
- ANCHOR_SYMBOL_MISSING Renderer layout flows.KBB38tYG.steps.GR20PFCl (entryRowEdges in card-layout.ts)
The binding warning of Entry row (entry-row.ts missing) on the current variant is also gone after adoption.
Read by hand: the check has no Rust adapter, so anchors and bindings in .rs files were tested by name only. I read card_layout.rs:64-69, card_layout.rs:752 and place.rs:284. Track layout is skipped as exposure-unknown (no root file that the check reads in crates/archboard-layout/src). layOutTrack crosses a worker and the wasm boundary, and the anchor cites the calling code in layout-engine.ts.

Footprint, read against base 7dd1846c193848f3378422462be58d687c5ace55 (the parent of 748c5962b, found with the trailer command). current was the proposal's parent on both boards:
- Renderer layout: namedAndChanged Layout engine, Block placement, Card blocks, Entry row, Block layout, Track layout; changedNotNamed none; namedNotChanged none. Skipped: View dispatcher (drill-down), and Pretext, Host canvas, Graphviz, Draw and measure, Engine and graph (unbound).
- Semantic renderer: namedAndChanged Renderer core; changedNotNamed none; namedNotChanged none. Skipped: Layout engines (drill-down to Renderer layout, which has its own proposal, read above), Archboard server, Browser application and Board viewer (drill-down), and Host canvas, Render entry, Layout and measuring, Painting, Key and export (unbound).
- The large commit is 748c5962b (61 files). It is this task's port, not a sweep.

Behind (step 7): after adoption, Renderer layout and Semantic renderer read 0 commits. The only other board that the task's commits put behind is Archboard: Workspace packages (packages) and renderer (packages/renderer), changed by 748c5962b, 69a9588bf and 3db2970b5. That board is still right. The renderer package still "Draws a board as a picture, in the browser or under Bun", the task changed no package import, and the board draws no crate. Its findings are the same in both runs, and none is about these commits.

`archboard check`: no diagnostics. Pictures (dark): the Responsibilities, Layout sequence, Engine and graph and Place the blocks views of Renderer layout, and the Everything view of Semantic renderer. They read as intended.

Closing decisions (2026-10-25). AC3: the TypeScript that only Track ran is gone; the modules listed above under 'Duplicates kept for Blocks' still run the Blocks solve and are deleted by TASK-520.05, whose own AC3 is the same criterion. AC4: the Track views took 12.3 s before and 8.1 s after in each of three runs; six views read 1 ms slower in every run at the harness's 1 ms resolution, which the user ruled immaterial on 2026-10-25 ('Nobody fucking cares'). Replayed onto the rebased branch at 748c5962b..0255cbe59: 0 of 2344 current-variant drawings differ, and bun run check passes with every lane.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The renderer core lays out every Track solve. The crate crates/archboard-layout holds the solve behind one function, lay_out_track(graph, &mut dyn Graphviz), and asks the host's Graphviz through the one-method trait Graphviz, which the wasm binding (layOutTrack, GraphvizHost) satisfies with viz-js. layout-engine.ts sends the track stage to the core and the blocks stage to placeBlocks, which now lays out Blocks only; the Track-only TypeScript is removed. Verified by replaying every recorded Track solve and route through the crate with byte-equal Graphviz graphs and equal answers, by 0 of 35,560 corpus drawings changed, and after the rebase by 0 of 2,344 current-variant drawings changed and a passing gate. Track renders faster (12.3 s to 8.1 s over the current views). Renderer layout@TASK-520.04 (v64) and Semantic renderer@TASK-520.04 (v105) are adopted. Follow-ups: the Blocks duplicates go with TASK-520.05, and a flowchart's track layout still crosses from the flows crate to TypeScript and back into the core.
<!-- SECTION:FINAL_SUMMARY:END -->
