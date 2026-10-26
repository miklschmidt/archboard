---
id: TASK-548.05
title: Every solve of a render gets a ready layout worker at once
status: To Do
assignee: []
created_date: '2026-10-26T10:51:00Z'
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
