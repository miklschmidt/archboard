---
id: TASK-548.02
title: >-
  Layout workers share one Graphviz answer for the same graph, across solves and
  renders
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T06:49:00Z'
labels:
  - renderer
  - performance
dependencies:
  - TASK-548.01
parent_task_id: TASK-548
ordinal: 935000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 23 first renders that timing.ts measures, 359 of 1,072 Graphviz calls lay out a graph that an earlier solve of the same render already laid out (2.2 s of 10.9 s Graphviz CPU). The core caches answers only within one solve, and each layout worker has its own memory, so repeats on other workers and in later renders are laid out again. The threaded-core spike (spike/wasm-threads, /tmp/spike-threads) showed that a cache shared by every solve and kept across renders re-renders Agent workbench after a relabel that keeps card sizes in 844 ms instead of about 1,600 ms. The owner rejected WebAssembly threads, so the cache must work with today's worker pool and without SharedArrayBuffer or cross-origin isolation. It is exact only once Graphviz runs in the core, whose answer depends on the graph alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Graphviz call for a graph that any earlier solve of the process laid out is answered from the shared cache, on any worker
- [x] #2 A re-render after an edit that keeps every card's size lays out no graph again
- [x] #3 The cache's memory is bounded, and the bound is stated where it is set
- [x] #4 Every drawing of the corpus is unchanged
- [x] #5 It works under Bun and in the browser without SharedArrayBuffer
- [x] #6 The renderer's focused tests (bun test packages/renderer) and cargo test for the changed crates pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design (chosen): each worker's core remembers Graphviz answers across solves, and the pool relays new answers to every other worker as they arrive.
1. Core (crates/archboard-renderer-wasm/src/layout.rs only; archboard-layout and archboard-graphviz untouched so 548.03/548.04 merge cleanly): the Graphviz port the binding hands lay_out_board consults a per-instance memory (graph text -> json0 answer, keyed by the full text, so it is exact) before calling archboard_graphviz::render. layOutBoard(graph, learned?) pushes each graph it laid out and its answer onto learned. New export rememberGraphvizAnswers(pairs) adds answers another worker laid out. Memory bounded in bytes (32 MiB, stated at the constant), oldest forgotten first; a forgotten graph is laid out again to the same answer, so eviction cannot change a drawing.
2. Worker (layout-engine.ts): passes an array to layOutBoard and replies { id, data|error, graphviz: pairs }; a { graphviz } message is applied in turn with the solves, so a solve sent after it finds those answers.
3. Pool (engine-pool.ts): remembers every pair a worker reports (same bound, oldest first), and posts the new ones at once to every other worker, and the whole memory to each worker it starts. Worker messages are FIFO, so any solve dispatched after an answer arrived finds every graph that answer laid out, on any worker. Solver port, ceiling, dispatch and call-off are unchanged.
Why this design: no SharedArrayBuffer and no synchronous wait; the alternative of sending a working set with each solve moves the same bytes but needs a choice of which answers a solve may need (the core cannot say in advance), and sending to the worker that holds the answers cannot cover parallel candidates on several workers. Broadcasting moves each answer once per worker, measured below against the CPU saved. Solves running at the same time cannot share (inherent without shared memory).
4. Tests: focused test that a re-render after a size-keeping relabel lays out no graph (owner of AC2), pool test that answers reach other and new workers, Rust unit test of the bound.
5. Measure: hits/misses and Graphviz CPU on timing.ts first renders (temporary instrumentation, not committed), timing.ts 7 alternating with 1db8eb36b twice each with uptime, the relabel and a size-changing edit, corpus compare against /tmp/t548/base.
6. Boards: proposals Renderer layout@TASK-548.02 and Semantic renderer@TASK-548.02 for the engine pool and the wasm binding, then adopt.
7. Gates: bun test packages/renderer, cargo test for archboard-renderer-wasm, type-check, lint, fmt:check, benchmark, browser-drawn-pictures and drawn-glyphs.

8. Added after the owner's 500 ms target for re-renders: the pool also remembers each solve's answer by its graph (16 Mi characters, oldest forgotten first). Every solve text of a re-render after a size-keeping relabel equals the first render's (measured on Agent workbench and Board viewer), and a solve's answer depends on its graph alone, so this is exact. It took that re-render from about 0.8 s, all core layout with no Graphviz, to about 50 ms.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: each worker's core keeps a per-instance memory of Graphviz answers keyed by the full graph text (crates/archboard-renderer-wasm/src/layout.rs, Remembering wraps archboard_graphviz::render; archboard-layout and archboard-graphviz are untouched). layOutBoard(graph, learned?) pushes each graph it laid out and its answer onto learned; rememberGraphvizAnswers(pairs) adds answers from other workers. The pool (engine-pool.ts) remembers every reported pair and posts the new ones at once to every other worker and the whole memory to each worker it starts; worker messages are FIFO, so a solve dispatched after an answer finds it. Bounds: 32 MiB per core instance and 32 Mi characters in the pool for Graphviz answers, 16 Mi characters for solve answers; oldest forgotten first, and a forgotten graph or solve is laid out again to the same answer.
Rejected: sending a working set with each solve (the core cannot name in advance which graphs a solve asks for; sending all of a board's answers with every solve moves the same bytes more often); routing a solve to the worker that holds the answers (parallel candidates run on several workers at once, and broadcasting makes every worker hold everything anyway).
Moving cost (instrumented run, not committed, timing.ts first renders): 893 pairs reported, 53.4 MB (15.3 MB graph text, about 38 MB answers); the pool spent 70-81 ms relaying them, the workers 260 ms remembering them. Graph text is 29% of the bytes, so a hash key would save less than a third of it, and would need a new SHA dependency; the full text is the exact key.
Hit rate, timing.ts first renders (instrumented, 05:52 load 4.8-5.2): 1,070 Graphviz calls with sharing off, 11.3 s Graphviz CPU. With sharing: 177 answered from memory, 893 laid out (10.5 s and 9.9 s Graphviz CPU in two runs), so 0.8-1.4 s saved against 0.33 s of relaying. 181 of the misses are graphs another worker was laying out at the same time: solves that run at once cannot share without shared memory, so 177 of the 359 repeats are reachable this way.
Timing, timing.ts 7, alternating parent 1db8eb36b and HEAD in this worktree (sources and core build swapped): parent 11,339 ms (05:08:04 load 5.03), HEAD 10,191 ms (05:08:19 load 5.50), parent 11,018 ms (05:08:31 load 5.35), HEAD 9,913 ms (05:08:45 load 5.05). Agent workbench first 1,820/1,691 parent against 1,666/1,646; Board viewer 1,669/1,676 against 1,457/1,443.
Edits (scratch script, real pool of 7 Bun workers, load about 4.6-6): Agent workbench first 2,213-2,358 ms; relabel of Workhorse queue keeping its size: 48 ms, 0 graphs laid out, 9 solves answered from the pool (before the solve memory: 755-863 ms with 0 graphs laid out; with sharing off 1,477 ms); relabel that grows the card one line: 1,375-1,478 ms, 110 graphs laid out. Board viewer first 2,063 ms; size-keeping relabel of Camera arithmetic 53-56 ms, 0 laid out; growing it 1,466-1,483 ms, 22 laid out.
Why a size change lays everything out again: every Graphviz graph of both boards holds the grown card or a region holding it (Agent workbench: 84 graphs of 47 nodes, 16 of 121, 10 others; Board viewer: 6 of 117 and 16 of 162 nodes, whole-board graphs). The only attributes that differ are that card's height and its regions' sizes, so no answer can be reused exactly. With every Graphviz answer reused a size change would still cost about 0.7-0.8 s of the core's own layout per solve round (the size-keeping re-render before the solve memory), so 500 ms for a size change needs TASK-548.04's work or an incremental layout that keeps unchanged parts, which changes the method and is outside this task.
Boards: proposals Renderer layout@TASK-548.02 (Engine pool, Layout engine, Board layout descriptions) and Semantic renderer@TASK-548.02 (Engine pool, Renderer core), compared (descriptions and responsibilities only, no interface change) and adopted (versions 90 and 135). archboard check --code: no finding on the parts this task touched; the four findings on those boards (EXPOSED_UNUSED x2, CALLER_UNDRAWN Crossing pass, RELATIONSHIP_UNDRAWN Scene) predate it.
Corpus: render-corpus render /tmp/t548/02-after --variants current --jobs 1 (20 s) against /tmp/t548/02-parent rendered from the parent's sources in this worktree on the same vault (25 s): 0 of 2,344 drawings differ. Against /tmp/t548/base (e84d2c48, an older vault): 2,128 shared drawings identical, 216 under renamed variants paired by board and view, 160 identical, 56 of Renderer layout and Semantic renderer whose content TASK-548.01 changed. No drawing changed, so the defect waiver did not arise.
Tests: bun test packages/renderer 653 pass, 1 skip, 0 fail; cargo test --locked -p archboard-renderer-wasm 2 pass; type-check, lint (nix develop) and fmt:check exit 0; bun run benchmark 40 pass (05:09:13 load 4.63); browser lane --focus browser-drawn-pictures 1 pass and drawn-glyphs 1 pass (the lane rebuilt dist/frontend from these sources); archboard semantic rasterize of Renderer layout through this worktree's restarted server drew the board.

Correction: the instrumented hit-rate runs were at 04:52-04:53 (load 4.75-5.18), not 05:52. The change uses no SharedArrayBuffer, Atomics or cross-origin isolation: answers move by postMessage only.

Regression fix on task-548.02-fix (from feat/faster-first-render 33d00368e): the Graphviz answer relay and the per-instance Graphviz memory are removed; the pool's solve memory stays.
Mechanism: under Bun, the ninth WebAssembly instance of a process and every later one (the main thread's core plus eight or more workers) grows its memory about 35 times slower. A replay of the real 469-pair, 33.5 M character store into a fresh worker took 44-48 ms with up to 6 other workers running and 1,708-1,758 ms with 7, 8, 9 or 12. The pool handed each worker it started late the whole store, so the late worker spent 1.7 s growing memory before the solve it was started for: Live panes started worker 9 (1,693 ms in rememberGraphvizAnswers), Board rasterizer started worker 8 (795 ms). Every worker also grew to hold the full store through the relay.
Measured over the full vault sequence (scripts/tmp-seq.ts, one render each, two rounds, load 1.3-2.8): relay with start-up store 8,778/8,726 ms; relay without it 5,926/5,998; per-worker memory without relay 5,741/5,678; no Graphviz memory 5,728/5,685. Neither the relay nor a per-worker memory pays for itself once TASK-548.03 made Graphviz faster, so both are gone.
Against 33d00368e, alternating (load 1.2-3.3): timing.ts 7 first-render total 9,134/9,208 ms against 5,760/5,746 ms; Live panes 2,002/2,046 against 327/332; Browser application 1,900/1,983 against 380/344. Full sequence 8,594/8,773 against 5,701/5,653 ms; Live panes 1,972/2,122 against 395/359.
Edits (Bun host, load about 2.8): Agent workbench first 1,200-1,205 ms, size-keeping relabel 47 ms, growing relabel 941-944 ms; Board viewer first 1,307-1,319 ms, size-keeping relabel 53-54 ms, growing relabel 859-863 ms.
Corpus against /tmp/t548/all-after (33d00368e): 0 of 2,344 drawings differ. bun test packages/renderer 651 pass, 1 skip, 0 fail; type-check, lint, fmt:check exit 0; cargo test -p archboard-renderer-wasm passes. The edit owner is now packages/renderer/tests/runtime/services/layout-workers.test.ts, which holds a size-keeping relabel to sending no solve to a worker; it fails with the solve memory disabled.
Follow-up for the parent: AC #1 (a Graphviz call for a graph any earlier solve laid out is answered from the shared cache, on any worker) is no longer met, because the relay was removed for being a net loss. Workers past the eighth WebAssembly instance also grow memory slowly in their own solves; the pool's ceiling (cores minus one, 23 here) starts them on wide boards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Layout workers now share Graphviz answers, and the engine pool shares solve answers, across solves and renders, with every drawing unchanged.

What changed:
- Each core instance remembers the Graphviz answers it laid out or was handed, keyed by the full graph text and bounded at 32 MiB (crates/archboard-renderer-wasm/src/layout.rs). layOutBoard(graph, learned?) reports new answers, and rememberGraphvizAnswers adds answers from other workers.
- The pool relays each new answer to every other worker, and the whole memory to each worker it starts (bound 32 Mi characters).
- The pool also answers a solve it answered before at once (bound 16 Mi characters).
- archboard-layout and archboard-graphviz are untouched.

Why: 359 of 1,072 first-render Graphviz calls repeated an earlier solve's graph. The owner rejected shared memory, so answers move by postMessage. Solves that run at the same time cannot share, so 177 of those repeats are hits.

Evidence:
- Graphviz CPU on the timing.ts first renders: 11.3 s down to 10.5 s and 9.9 s.
- timing.ts 7, alternating with 1db8eb36b: 11,339 and 11,018 ms down to 10,191 and 9,913 ms.
- A relabel that keeps card sizes re-renders Agent workbench in 48 ms and Board viewer in 53-56 ms, with no graph laid out, against about 1.5 s before. A relabel that grows one card still takes about 1.4-1.5 s: every Graphviz graph of those boards holds that card.
- Corpus: 0 of 2,344 drawings differ against the parent.
- Gates: renderer tests, cargo test, type-check, lint, fmt:check, benchmark and the two browser owners all pass.
- Tests that own the work: tests/runtime/services/layout-workers.test.ts (real workers) and engine-pool.test.ts.
- Boards: Renderer layout and Semantic renderer proposals were adopted.

Risks and follow-ups:
- Memory: about 32 MiB of wasm memory per worker once full, plus up to 48 Mi characters in the pool's thread.
- A size change on a wide board stays above 500 ms. That needs faster core layout (TASK-548.04) or incremental layout, which is outside this task.
<!-- SECTION:FINAL_SUMMARY:END -->
