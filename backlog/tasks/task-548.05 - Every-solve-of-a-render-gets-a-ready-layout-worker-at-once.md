---
id: TASK-548.05
title: Every solve of a render gets a ready layout worker at once
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T10:51:00Z'
updated_date: '2026-10-26T11:04:00Z'
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
<!-- SECTION:NOTES:END -->
