---
id: TASK-520.04
title: The core lays out Track boards
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T02:34:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.03
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 924000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layout moves to Rust one engine at a time, each against the drawing geometry that the TypeScript stage answers as the oracle. This task ports the Track engine and the shared layout rules (shared/rules/layout, shared/rules/track). Text measurement and Graphviz stay capabilities that the host gives the core through imports until TASK-520.07 and a later decision (ADR 0057). The corpus is every board whole, every view and every non-current variant of the dogfood vault and the vaults under examples/, under both engines and both themes, with and without the comparison.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The core answers the drawing of every corpus board that Track lays out, and the drawing is equal to what the TypeScript stage answered
- [ ] #2 Every corpus picture is the same bytes as before the change
- [ ] #3 The ported TypeScript rules are gone from packages/renderer
- [ ] #4 No corpus board renders slower, measured with the same harness before and after
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
<!-- SECTION:NOTES:END -->
