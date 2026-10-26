---
id: TASK-520.08
title: The renderer package is a thin host of the core
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 12:54
updated_date: '2026-10-26T13:13:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.07
documentation:
  - >-
    docs/adr/0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the layout, painting and text ports, the renderer package still holds the TypeScript that turns a board and its policy into a drawing request (shared/rules/render: shown, appearance, step lines, the render reply). This task moves what remains into the core, so a native frontend gets a scene from board content alone, and leaves the package as the host that loads the core, gives it Graphviz and the icons, and runs the rasterizer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The core takes the content, the policy and the render choices of a board and answers the render reply with its scene and SVG
- [x] #2 A cargo test renders a corpus board natively to the same SVG bytes as the WASM build
- [x] #3 packages/renderer holds no layout, painting or measurement rules in TypeScript
- [x] #4 The Semantic renderer and Renderer layout boards draw the core as built
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baselines before any change, from a copy of d85121ef0 (/tmp/th-base): full corpus (render-corpus --variants all --jobs 4), export corpus (every board's current variant and view, both engines, comparison on/off, no/horizontal/vertical legend, legend alone, no title/names/own words, themes cycled; SVG hash and whole-reply hash), and two timing runs of the current views with --jobs 1.
2. archboard-layout draws an architecture: board content types, the compound graph, the choice between solves as async Rust over a Solver port (the solves still run side by side on the host's worker pool), the drawing, page fit, and the crossing pass (crossings, hops, clusters, folded crossings). One draw() for the render and the flowchart.
3. archboard-flows calls archboard_layout::draw with the Solver port; FlowchartHost and its JSON crossing go; one copy of reversed.
4. New crate archboard-render: the render request (content, policy, render choices) to the render reply (scene, SVG, size, atlas, placed, reading direction, picture key), with step lines, appearances, measurement, entry points, the comparison-less drawing, titles and the layout memo. Ports: Solver (and Graphviz below it) and icons.
5. wasm binding: render(request, host) and layOutBoard(graph, graphviz) only; typed through ts-rs and unchecked_return_type so the JSON casts go.
6. TypeScript: the hosts load the core, give it the pool, Graphviz and icons; board.ts keeps the board package's reading (variant, view, comparison); delete diagram, flows, paint, measure, shown, step-lines, appearance, picture-key scanning, engines, block-engine, solves, joins-laid, compound-graph, page-fit, routes, geometry and spacing. The web reads the key from the reply.
7. Native cargo test renders a corpus board through a recorded-Graphviz adapter to the SVG bytes the WASM build wrote.
8. Corpus, export and reply compares, timing, docs, gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (branch thin-host):

- New crate `crates/archboard-render`: `Renderer::render(&RenderRequest, &impl Host) -> Rendered`. The request carries the reading, the policy, the render choices, the clock (`@archboard/timing` durations) and the theme colours. The reply is the document, its atlas, `appearances`, `key` and the scene (kept for a native frontend). `Host: Solver + icons(names)`. A memo of 64 layouts shares one in flight.
- `archboard-layout::draw` draws an architecture for the render and for the flowchart's Track. The choices between solves (joins, stacking, packed groups) are async Rust over the `Solver` port. The host only schedules the solves on its worker pool. Decision: choosing moved into the core, because the host had only scheduling left and the choice needs no JS. The `Calling` handle calls off a solve the core no longer needs without dropping it. The host refuses a waiting solve (`Unsolved::CalledOff`), and the core lays it out afresh where a later turn needs it. A running solve answers, and a later turn shares it (TASK-464).
- Crossing pass ported to `archboard-layout::routes`. One `reversed` in `archboard_scene::geometry`. `Edge.path` stays: the painter writes `path_of(curve)` once.
- WASM: `render(request, host)` and `layOutBoard(graph, graphviz)` only. The `Rendered` type comes from ts-rs. No JSON casts remain in layout-engine.ts.
- TS: `packages/renderer` resolves variant, view and comparison into a request and runs solves (host.ts, diagram.ts, engine-pool, layout-engine). About 5,900 lines of layout, painting and measurement TS are deleted. The web reads the key from the reply. `@archboard/elk-rs` dropped.

Evidence:

- AC1: `crates/archboard-render/src/lib.rs` `Renderer::render`. TS callers in `packages/renderer/src/shared/rules/render/diagram.ts`. Export replies: `0 of 17640 replies differ`, `0 of 17640 answers carry appearances or a key other than the old scan of their document`.
- AC2: `crates/archboard-render/tests/native.rs` `a_native_build_draws_a_corpus_board_to_the_bytes_the_webassembly_build_draws` (examples/web-shop, Recommendations @ Nightly batch, Track, light). Recorded Graphviz per solve, because Graphviz is a C library that the host runs. The test checks every graph that a solve asks Graphviz for. Fixture from `packages/renderer/tests/runtime/support/capture-native-fixture.ts`.
- AC3: `packages/renderer/src` holds no layout, painting or measurement rules (deleted in 72d7156d7). Remaining: request resolution, host ports, engine pool, rasterizer, icons.
- Corpus: `36360 drawings of 51944 jobs in 304 s`, `0 of 36360 drawings differ` against /tmp/host-before. Exports: `0 of 17640 exports differ`.
- Timing (current views, --jobs 1, paired runs alternating builds): blocks 12500 -> 12140 ms and 11816 -> 11956 ms. Track 13350 -> 12932 ms and 12648 -> 12790 ms. `0 of 2344 drawings differ`. No change beyond noise.
- Join sharing: `join-candidates.test.ts` (6 cases: two call-off orders, and an active, queued, cancelling and failed candidate) passes.
- Deleted TS tests owned in Rust: `crates/archboard-layout/src/routes/tests/{mod,layering,clusters,shown}.rs`.
- Gate: `bun run check` 19/19 lanes. test:modules 4815 pass, 1 skip. test:system 257 pass. test:repository 144 pass. serial-browser 27 pass. cargo test 152 passed.
- AC4 (boards) is left to the parent's board agent. Proposed changes are in the report.

Board closing (AC4), steps 1 to 7 of archboard-dev's closing:

- Adopted `Semantic renderer@TASK-520.08` as current (variant EfSQrGns, board version 125) and `Renderer layout@TASK-520.08` (variant rC4cyrvv, board version 81). Both were branched from TASK-520.07's adoption (versions 121 and 77). `semantic footprint` reported that variant as `current` on both.
- Semantic renderer: the core's one call is `View dispatcher` (wpI1LbzG). It is rebound to crates/archboard-render/src as `Renderer::render`: it chooses the grammar, measures, has Layout engines lay the reading out, paints, writes the document and reads the key. `Paint hand-off` (bPGTrIBH) is rebound to diagram.ts as `Render hand-off`, which sends one `render(request, host)`. `Renderer core` (the wasm crate) exports only render and layOutBoard. `Layout engines` is bound to crates/archboard-layout/src and asks for solves through the Solver port (Layout engines -> Renderer host). The View dispatcher asks for icons through the Host port. `Picture key` is rebound to crates/archboard-svg/src/key.rs `appearances`, and it reaches `Board viewer` with the reply (use-stage-appearances.ts). `Edge geometry` is rebound to archboard-scene geometry.rs `curve_through`. `Flowchart` is rebound to the flowchart directory and calls `archboard_layout::draw` (answer_order.rs). Added `Key marks` (key-marks.ts), with Board viewer -> Key marks (SemanticChanges.tsx markCounts). Removed `Flows hand-off` (flows.ts deleted), `Bun measurement entry` (measure.ts deleted), Layout engines -> Renderer core "weigh the choices", Renderer core -> Architecture painter (it continues as View dispatcher -> Architecture painter, 98et92HX), Board answer -> Picture key (placedStanding now lives in board.ts), and Bun renderer -> Measured text. Restated the flows Render a board, Draw a view, Draw a sequence and Frame a picture for export, the walkthrough (2 beats added) and the views Draw a view, Host seam, Renderer integration, Layout and measuring and Key and export. Corrected the stale words on Measured text (measure_board, measure.ts) and on Export frame and Export legend (Rust names).
- Renderer layout: `Layout engines` (mHYMkWdE) is now `Layout entry`, bound to architecture/mod.rs `draw`. `Block engine` (oycxx6G2) is now `Choice between solves`, bound to choosing.rs `placed_blocks`. `Compound graph` is rebound to architecture/graph.rs `compound_graph`. All three now sit inside `Board layout`, whose code they are. Added `Crossing pass` (crates/archboard-layout/src/routes) and `Engine pool` (engine-pool.ts). Engine and graph is now `Layout workers`, unbound, and holds Engine pool and Layout engine. Removed `Block layout` (packages/renderer/src/shared/rules/blocks deleted), View dispatcher -> Compound graph (the core passes entry points to draw), the duplicate View dispatcher -> Layout engines, and Block layout -> Board layout. Choice -> Engine pool (wCXK6KYw) asks for each solve through the Solver port, and Engine pool -> Layout engine is an rpc to a free worker. Restated the flows Measure, settle, paint, Sizing a card and Lay out a drawing: the packed solve is now asked for side by side, and the crossing pass runs after the page is fitted. A beat on the crossing pass was added. The views Engine and graph and Block layout became Layout workers and Board layout.
- Code check, diff method (`findings` against `findings --variant TASK-520.08`): after two corrections, no `>` line. The first run had 3 `>` lines. ANCHOR_MISMATCH on step wDRB4HrE (SemanticRenderError is defined in render-request.ts): re-anchored to diagram.ts renderSemanticView. EXPOSED_UNUSED createLayoutEngine and CALLER_UNDRAWN on Layout engine: both came from binding Layout workers to the engine directory, so the container was left unbound as Engine and graph was. The proposals clear 81 `<` lines: 64 ANCHOR_PATH_MISSING, 16 ANCHOR_SYMBOL_MISSING and 1 RELATIONSHIP_UNDRAWN (View dispatcher -> Renderer host). The 10 binding warnings on the old current variants cleared at adoption.
- Read by hand: the code-intel adapters do not read Rust (`skipped 1 checkout: text-only`). So every Rust anchor and binding was tested by name only. Each was read at its source (lib.rs paint/document/appearances/icons, architecture.rs measure_node/draw/shown_of, flows.rs picture, render.rs render, layout.rs lay_out_board, choosing.rs solve/has_regions/better/reads_better_packed/placed_blocks, mod.rs compound_graph/placed_blocks/fitted_page/bridge_crossings, drawn.rs curve_through, answer_order.rs draw, memo.rs laid with REMEMBERED_LAYOUTS = 64). These relationships cross the WebAssembly boundary and are anchored at the code that sends: Layout engines -> Renderer host, Choice between solves -> Engine pool, Picture key -> Board viewer, and View dispatcher -> Renderer host.
- Findings in both runs, not about this task's changes: ANCHOR_SYMBOL_MISSING slab_shadow on Architecture painter -> Slab surfaces (xKJERQyv). architecture.rs is unchanged since base. RELATIONSHIP_UNDRAWN Browser -> Semantic renderer on Archboard server and Archboard server routes.
- Footprint read against base 226903a89 (`git log --grep='^Refs:.*TASK-520[.]08\b'`, first code commit 9f561d368). namedAndChanged covers every part the proposals name. changedNotNamed on Semantic renderer: Engine pool (engine-pool.ts, 33807e3a0, solve types narrowed to string, scheduling unchanged) and Viewer marks (marks.ts, 33807e3a0, inlined `coord` after geometry.ts was deleted). Both are internal, and the board stays true. namedNotChanged: Architecture painter and Sequence painter, named only by relationships and steps whose caller moved. That is normal.
- `archboard check`: no diagnostics. `archboard check --code` behind, boards the task's commits put behind: Board viewer and Browser application (SemanticBoardStage.tsx in 33807e3a0: the stage now takes `{appearances, key}` from the reply). Neither board draws the legend or the key, so both stay true. Their Draw here and Browser renderer still say the core in the page draws and a worker pool lays out each solve. Archboard (renderer and board packages): the renderer still draws a board as a picture, and board gained the reply's AppliedAppearance/PictureKey schemas and levels.ts drillDirection. Both responsibilities still hold, and renderer -> board still anchors at board.ts addressedVariant. Skill evaluation (evals/coverage.json in 6853bb85d): only a test owner path moved. Archboard server and Archboard server routes: no commit of this task touches them. Their render steps say "the picture", and the route answers the whole reply. No finding on these boards differs from the run before the proposals.
- Rasterized in dark mode: the overviews, Host seam, Key and export, Draw a view, Layout and measuring, Responsibilities, Lay out a drawing, Board layout and Layout workers. Each draws what is described above, with no overlap or missing line.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The renderer package is a thin host of the core. The new crate crates/archboard-render answers the whole render reply through one call, Renderer::render(&RenderRequest, &impl Host): reading, policy and render choices in; the document, its atlas, each subject's appearance, the picture's key and the scene out. The host gives it the solves and the icons; WebAssembly exports only render and layOutBoard. The choosing between solves moved into crates/archboard-layout as async Rust over a Solver port whose Calling handle shares a running or failed solve with a later turn, as TASK-464 chose; the worker pool only schedules solves. A flowchart's track layout calls the layout crate directly, the picture key comes from the core and the web reads it from the reply, the JSON type assertions and the copied helpers are gone, and about 5,900 lines left packages/renderer/src. Every deleted TypeScript test has a Rust owner with the same assertions. A cargo test draws examples/web-shop natively to the bytes of the WebAssembly build, replaying the Graphviz answers it recorded. 0 of 36,360 corpus drawings and 0 of 17,640 exports, replies and keys differ; timing is unchanged within noise. Semantic renderer v125 and Renderer layout v81 draw the core as built. Open: the browser tips still read appearances from the DOM rather than from the reply.
<!-- SECTION:FINAL_SUMMARY:END -->
