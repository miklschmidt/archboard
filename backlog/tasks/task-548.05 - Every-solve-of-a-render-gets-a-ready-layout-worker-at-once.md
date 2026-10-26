---
id: TASK-548.05
title: Every solve of a render gets a ready layout worker at once
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T10:51:00Z'
updated_date: '2026-10-26T14:01:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 938000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured on feat/faster-first-render 4a2d4d0b4 with a temporary trace in engine-pool.ts: the pool starts one worker at a time, and only after every worker has answered a solve, so six of Agent workbench's eleven solves waited 250 to 300 ms for a worker even on a warm pool, and a cold Board viewer took about 1.3 s against about 0.72 s warm. Letting the pool start workers without that wait took a cold Board viewer to 830 to 890 ms. Under Bun, a WebAssembly instance past JavaScriptCore's limit of fast memories (BUN_JSC_maxNumWasmFastMemories, unstable and not for the product) grows its memory about 35 times slower, which TASK-548.02 measured: Agent workbench's critical solve landed on the tenth worker and took about 790 ms against about 500 ms on a warm worker. A worker also stays busy with a solve the previous render dropped. The owner's goal is real-time scene changes, with complex boards under 500 ms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every solve a render asks is sent to a worker without waiting for another solve's answer, while the pool is below its ceiling
- [ ] #2 Under Bun, no solve pays the slow memory growth of a WebAssembly instance past the fast-memory limit, measured on the tenth worker
- [ ] #3 First renders of the timing.ts boards are measured on a cold and on a warm pool, alternating with the parent commit, and recorded in docs/design/first-render-critical-path.md
- [ ] #4 Every drawing of the corpus is unchanged, and bun test packages/renderer passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify criterion 1 on e05d1abfa (ported TASK-527 ready signal) with a trace of a real render through the pool.
2. Measure which WebAssembly in a Bun process takes a fast memory (main thread core, web-tree-sitter of the server's code check) and how Chromium's workers behave, before applying a Bun rule.
3. Choose by alternating measurement: a Bun ceiling that keeps every worker on a fast memory (6 or 7), starting workers side by side rather than one after another, a memory reserve at worker start, and what a dropped in-flight solve costs.
4. Implement in the engine pool and bun-host only, one focused test each for added behaviour.
5. Record cold and warm first renders against e05d1abfa (tmp-warm, tmp-seq, timing.ts 7) with load, corpus compare (0 differ), bun test packages/renderer, and a section in docs/design/first-render-critical-path.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 measurements on b39ce7afa (Bun, 24 cores, load average 6.5 to 10.9 shared with other agents). Stopped before any code change: origin/main 5454f51bc (TASK-527) already changed engine-pool.ts, layout-engine.ts and both layout-worker.ts files (ready message from the worker, stopping the worker of a called-off stacking way). This task waits for the rebase of feat/faster-first-render onto origin/main.
- Parent first renders (scripts/tmp-warm.ts, load 9.5): cold Agent workbench 1221, 1313 ms; cold Board viewer 1593, 1632 ms; warm sequence Board viewer 1444/1465, Browser application 570/476, Agent workbench 961/1053 ms.
- A Bun layout worker starts in about 10 ms: 12 workers started at once all answered a first trivial solve within 8 to 13 ms, and instantiating the handed core takes 1 to 5 ms. Starting a worker is cheap; waiting for another solve's answer before starting one is the cost.
- Bun's fast-memory limit is 8 WebAssembly memories per process: with 12 workers plus the main thread's core, 5 workers in every run had bounds-checked memories (one-page grow 4 to 16 ms against 0.01 to 0.03 ms). Which workers get them follows the race of instantiation, not the start order.
- A bounds-checked memory copies itself on every grow, so growth is quadratic: growing 2 to 127 MiB one page at a time took 36 to 44 s on such a worker against 3 to 6 ms on a fast one. Rust's dlmalloc on wasm32 grows memory by just the request, rounded up to 64 KiB, so a solve that grows its memory grows it in many small steps.
- A solve's memory is small: the peak of any worker over all timing.ts first renders was 15 MiB (Agent workbench's critical solve 13 MiB). A worker's memory never shrinks, so only a worker's first large solve pays for growth.
- A single external memory.grow does not help: dlmalloc does not use pages grown outside it, so the solve grew past them again (127 to 130 or 138 MiB). An allocate-and-free of 32 MiB through the core's own allocator (__wbindgen_malloc then __wbindgen_free) at start leaves that space in dlmalloc's top chunk, and the critical solve then grew no memory (34 MiB before and after). This could become a reserveMemory export in crates/archboard-renderer-wasm.
- Bounds-checked memories also run slower, not only grow slower: solve 0 of Agent workbench, best of 5 on each of 12 workers with 32 MiB reserved (load 10.9): fast memories 307 to 340 ms, bounds-checked 374 to 394 ms, about 20% slower. Reserving memory removes the growth cost but not this. Keeping the Bun pool within the limit (main thread plus 7 workers) avoids both. Other WebAssembly in the same process would also count toward the limit; that was not checked.
- Agent workbench's solves through the parent pool (at, wait plus solve in ms): eleven solves asked at +55 to +65 ms, answered after 492, 227, 123, 111, 573, 805, 715, 821 (dropped), 1080, 974, 0 (dropped before it started). Board viewer: 539, 431, 356, 261, 0 (dropped), 713, 649 (dropped), 609. Solve 8 alone took 590 to 750 ms on one worker at load 7 to 10.
- Dropped solves holding workers: not measured beyond the two dropped-after-start solves above (821 and 649 ms of worker time).

2026-10-26 on e05d1abfa and after (Bun 1.4.4, load average 25 to 34 throughout; times are about twice those of the notes above). Full numbers in docs/design/first-render-critical-path.md, section 'A ready worker for every solve'.
- Criterion 1, trace of a cold Agent workbench (pre-6cae688bb content) through the pool with ceiling 6: eleven solves asked within 35 ms; the first six sent to six new workers within 170 ms, each worker ready 24 to 45 ms after it started, first answer 617 ms after the first send. The rest wait only because the pool is at its ceiling. The TASK-527 ready signal ported in the rebase meets it; engine-pool.test.ts 'a worker whose core is instantiated lets the next solve start another worker before it answers' owns it.
- Fast memories, measured with the real core (20 one-page grows from 53 pages): main thread core plus workers 1 to 7 grow in place (0.0 ms), workers 8 to 12 copy (29 to 33 ms). With web-tree-sitter initialised first (the server's code check; three grammars loaded) only workers 1 to 6 grow in place: tree-sitter holds one memory. A stopped worker gives its memory back. A module with a memory and no code grew in place in 13 instances, so a probe must use the core. Chromium 155: 30 workers plus the page grew 200 pages each in 0 to 4 ms, no limit, so the browser keeps cores minus one.
- Decision: the Bun host caps its pool at six workers (bun-host.ts bunWorkerCeiling, test tests/runtime/services/bun-host.test.ts). Ceilings 23, 7, 6 alternated three times: cold Agent workbench 2523/2660/2973, 2273/2232/2369, 2564/2098/2395 ms; 6 and 7 equal, 6 keeps the server's workers fast after a code check.
- Criterion 2: cold Agent workbench through a probe worker (median of nine one-page grows after each solve): ceiling 23, workers 8 to 11 copy on grow (2.6 to 15.7 ms) and the longest solve ran 2350 ms on worker 8, render 3030 ms; ceiling 6, every worker 0.00 ms, longest solve 1433 ms, render 2196 ms.
- Not kept: starting workers all at once (cold Agent workbench 2212/2095/2134/2928 vs one at a time 2325/2513/2048/3133 ms, other boards no direction); a 32 MiB reserve through __wbindgen_malloc/free at worker start (2714/2104/2313 vs 2186/2571/2198 ms, same solve times on fast memories), so no reserveMemory export; stopping a worker whose solve is called off, because the pool cannot tell a dropped solve from a called-off one the layout may still read (TASK-464, solving.rs) and both abort the same signal. A dropped solve kept its worker 0.9 s after the drop.
- Against the parent, alternated twice (load 27 to 31): cold Agent workbench 2709/2624 vs 2417/2252 ms; Archboard server routes timing.ts first 3982/4055 vs 2612/2708 ms; vault sequence totals 22743/22210 vs 22191/20804 ms; timing.ts first totals 23623/24312 vs 23595/25147 ms (load spike in the second run). Other boards within noise.
- Corpus (current variants, --jobs 1, parent vs this task): 0 of 2376 drawings differ.
- Not the pool: Board viewer, Board persistence and Archboard server routes as the rebase left them wait on one solve of 3.5, 3.2 and 2.2 s at load 25 to 28; the same boards as b39ce7afa held them have longest solves of 1.6, 1.0 and 0.5 s with this code.

Correction to the Chromium line above: only the 30 workers grew their memories; the page instantiated one of its own and did not grow it.

Cold first render of all 17 vault boards plus Agent workbench (pre-6cae688bb), one process each, alternating parent and this task twice at load 29 to 32: totals 35252/35443 vs 31321/33297 ms; Agent workbench 2931/2881 vs 2146/2161 ms. Board viewer measured 5040/4490 vs 5555/5363 ms, so it was traced three more times per ceiling: its longest solve runs on a fast memory at both ceilings and is sent within 0.2 s; solve 5072/4991/4785 ms (23) vs 5007/4724/4467 ms (6), render 5512/5564/5240 vs 5575/5175/4797 ms. No slowdown from the ceiling.
bun test packages/renderer at load 28, two runs each: parent fails the 3 s first-layout bound of wide-boards.test.ts on Archboard server routes, Board persistence and Board viewer; this task on Board persistence and Board viewer (660 pass, 2 fail). The test:modules lane (--isolate) passed 4949/0, test:system 285/0, test:repository 161/0; types, lint:tests, lint:policy and format:check passed. Criterion 4's 'bun test packages/renderer passes' is therefore not met at this load, under the parent either.

Boards: the Semantic renderer board's current variant (zZV4las8) states no worker ceiling (Engine pool, Bun host installation, Bun layout worker); only historical variants said 'one fewer than the cores'. The boards stay accurate, so no proposal.
<!-- SECTION:NOTES:END -->
