---
id: TASK-520.08
title: The renderer package is a thin host of the core
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:54
updated_date: '2026-10-25T16:39:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.07
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
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
- [ ] #4 The Semantic renderer and Renderer layout boards draw the core as built
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
<!-- SECTION:NOTES:END -->
