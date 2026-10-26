---
id: TASK-548.01
title: The core runs Graphviz itself, and viz-js leaves the renderer
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T03:28:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0057 kept Graphviz with the host "for now" and left replacing it to a separate decision. The spike on local branch spike/graphviz-pure (commits 6e13a06e1..b708f3905, notes in /tmp/spike-gvpure) showed that graphviz-pure 0.2.0 inside the core, with musl's qsort tie order and an exact fast fma for WebAssembly, answers all 222 captured Graphviz graphs exactly as viz-js does and changes 0 of 2,344 corpus drawings. Upstream graphviz-pure copies macOS libc's qsort on purpose (graphviz-pure-layout/src/cutil.rs:237), which changed 276 drawings. The owner chose to vendor the needed crates into this repository under their EPL-2.0 license. Moving Graphviz into the core also removes the C dependency of a future native frontend and makes a solve's Graphviz answers depend on their input alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR records that the core lays graphs out with the vendored graphviz-pure, and why (musl tie order, exactness, the spikes' findings), and ADR 0057 points to it
- [ ] #2 The vendored crates carry their EPL-2.0 license and THIRD_PARTY_NOTICES.md names them
- [ ] #3 No package of the renderer depends on @viz-js/viz, and no worker loads it
- [ ] #4 Every drawing of the corpus is unchanged against feat/rust-desktop-frontend
- [ ] #5 A native build of the core lays a board out with no C library and no host Graphviz
- [ ] #6 Rendering works in Bun and in the browser
- [ ] #7 The renderer's focused tests (bun test packages/renderer) and cargo test for the changed crates pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Vendor graphviz-pure 0.2.1 (latest 0.2.x on crates.io; 0.2.0 plus crash fixes outside our dot path) from the crates.io archives into crates/vendor/<crate>: graphviz-pure, -core, -geom, -layout, -parser, -render, each with its EPL-2.0 LICENSE and NOTICE, path dependencies between them, and a crates/vendor/README.md naming version, upstream URL and changes. The workspace excludes crates/vendor (third-party code keeps upstream's shape; the 600-line and inherit-lints rules, clippy, rustdoc and the formatters stay on archboard's crates). THIRD_PARTY_NOTICES.md names them.
2. Change in the vendored graphviz-pure-layout: qsort_by sorts as musl 1.2.6 qsort (smoothsort), the libc of Emscripten that viz-js's Graphviz sorts with; regenerate its qsort vectors from musl's own qsort.c.
3. New crate crates/archboard-graphviz: implements archboard_layout::Graphviz with the vendored engine: replays viz-js's cgraph calls on the core's Graph JSON, writes DOT with every final value explicit, renders json0 with y inverted. Check graphviz-pure for state that outlives a call (thread_locals) so an answer depends only on its input.
4. New crate crates/archboard-fma: correctly rounded fast fma that defines the C fma symbol on wasm32 (f64::mul_add in graphviz-pure); needs one local expect on unsafe_code, so the workspace's unsafe_code moves from forbid to deny with that single documented exception (decision to flag to the parent).
5. WASM binding: layOutBoard(graph) lays out with the in-core Graphviz; the GraphvizHost import goes. TS: drop @viz-js/viz (package.json, bun.lock, vite.config.ts inputs), loadLayoutEngine's memory snapshot and restore, viz-js in both layout workers; the pool hands each worker the WebAssembly.Module its main thread compiled (Bun and browser), and keeps the Solver port and worker pool. engineAborted keeps only the WebAssembly trap.
6. Native: crates/archboard-render/tests/native.rs lays out with archboard-graphviz; fixture holds request, icons and svg; capture-native-fixture.ts simplified.
7. ADR 0058: the core lays graphs out with vendored graphviz-pure (musl tie order, exactness on 222 graphs and 2,344 drawings, no C dependency, answers depend only on input, measured speed; dugong and threaded core rejected). ADR 0057's Graphviz section points to it. Sweep docs and comments for viz-js.
8. Board proposals Semantic renderer@TASK-548.01 and Renderer layout@TASK-548.01 (both draw the host's viz-js Graphviz); draw the plan, correct to what was built, adopt.
9. Checks: corpus compare vs /tmp/t548/base (0 of 2,344 changed), bun test packages/renderer, cargo test for changed crates, type-check, lint, fmt:check, benchmark, browser owner browser-drawn-pictures, timing.ts 7 x2 alternating with parent, uptime recorded.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- Vendored graphviz-pure 0.2.1 (latest 0.2.x, published 2026-10-26; 0.2.0 plus crash fixes in fdp/neato/osage and two panics turned into C's answers) from the crates.io archives into crates/vendor, upstream commit ecff610f. Commit fa221e7f2 holds them unchanged; d25f4418c applies archboard's two changes (path deps, musl qsort). The workspace excludes crates/vendor (Cargo exclude), the formatter ignores crates/vendor/*/**, and rust-crates.test.ts skips it; vendored code passes cargo fmt and compiles without warnings, so no rustfmt exclusion was needed.
- musl qsort: port of musl 1.2.6 src/stdlib/qsort.c (smoothsort) with the Leonardo bitmap in one u128. qsort_vectors.txt (144 of 160 cases changed) and tests/data/qsort_expected.txt (190 of 200 lines changed) were regenerated by compiling musl's own qsort.c natively; the vendored crate's 99 lib tests pass on a copy outside the checkout.
- Adapter lives in a new crate crates/archboard-graphviz (InCore implements archboard_layout::Graphviz), so archboard-layout changes only in its Graphviz doc comments (TASK-548.04 works there). Natively it answers all 222 captured graphs of /tmp/spike-gvpure/pairs.jsonl with viz-js's geometry (99 byte-equal, the rest differ only in non-geometry text); Apple's qsort differed on 98.
- Global state: graphviz_pure::render_dot resets the per-run render state each call (gradient/anchor ids, textfont dict, output order, loadimage); the rand state starts fresh per layout outside a run; Y_invert is set every call. The thread_locals left are warn-once flags and a colour-list warning flag (dot's json0 path with our attribute set never reaches it). Owner: crates/archboard-graphviz/tests/viz_js.rs answers two Apple-sensitive captured graphs, each twice around the other, byte for byte as viz-js did.
- fma: kept, as src/fma.rs of archboard-graphviz (no separate crate). Defining the C symbol needs #[unsafe(export_name)], which forbid(unsafe_code) cannot except; the workspace's unsafe_code is now deny with that one #[expect(unsafe_code, reason)], documented in docs/agents/strict-analysis-rust.md. The parent must accept or reject this policy change. Verified in the built wasm that the only function named fma is ours (371 bytes, calls libm's fma as fallback).
- Workers: layout-engine.ts is now the shared worker loop (serveLayoutEngine): first message {core: WebAssembly.Module}, then {id, graph}. Bun: core.ts keeps the module it compiled (compiledCore) and workers instantiateCore(module). Browser: loadBrowserCore compiles via compileStreaming and hands the module; the page starts workers (and its warm-up solve) only after the core loaded. engineAborted keeps only the WebAssembly trap; the Emscripten abort text check went with viz-js.
- Native fixture: request, icons and svg only; recaptured, and its svg is byte-identical to the viz-js-era fixture.

Evidence:
- Corpus: bun scripts/render-corpus.ts compare /tmp/t548/base /tmp/t548/01-after: 0 of 2,344 drawings differ. One-job corpus time: blocks 11,726 to 10,737 ms, track 12,686 to 11,691 ms.
- bun test packages/renderer: 649 pass, 1 skip (darwin-only), 0 fail. cargo test --locked -p archboard-graphviz -p archboard-render -p archboard-layout -p archboard-renderer-wasm: 99 passed, 0 failed. native.rs lays a corpus board out with InCore, with no C library and no host.
- bun run type-check and bun run lint: exit 0. bun run fmt:check (in nix develop): exit 0, also after the board adoption. bun run benchmark: 40 pass.
- Browser: tests/system/browser/browser-drawn-pictures.test.ts and drawn-glyphs.test.ts pass. archboard semantic rasterize of Renderer layout@TASK-548.01 drew the board through the worktree server.
- timing.ts 7, alternating runs. Each row gives the first renders in all, the slowest first render (Agent workbench) and the 1-minute load from uptime:
  - parent-1: 10,273 ms, 1,754 ms, 3.87
  - mine-1: 10,729 ms, 1,703 ms, 5.07
  - parent-2: 10,062 ms, 1,702 ms, 4.32
  - mine-2: 10,649 ms, 1,674 ms, 3.96
- The spike measured the same: pure 11,202 and 11,381 ms against viz 10,494 and 10,517 ms. The total is about 5% slower on this shared machine and the slowest board is slightly faster. TASK-548.03 owns the speed.
- Boards: on Renderer layout, proposal TASK-548.01 adds the part In-core Graphviz. It makes Graphviz the vendored graphviz-pure, bound to crates/vendor/graphviz-pure. It moves the anchors off createLayoutEngine and layOutBoard to serveLayoutEngine and answer. Proposal TASK-548.01 on Semantic renderer says the workers instantiate the core they were handed and layOutBoard(graph) ranks in the core. Both were compared and adopted (versions 87 and 132), commit d698e8f97. archboard check --code: no error, and the five ANCHOR_SYMBOL_MISSING findings on those boards are gone (26 to 21 warnings, the rest on other boards).
- The task stays In Progress with its criteria unchecked, for the reviewer and the parent to finalize.
<!-- SECTION:NOTES:END -->
