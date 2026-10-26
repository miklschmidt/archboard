---
id: TASK-548.06
title: A whole solve tries its wrap candidates side by side
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T10:51:00Z'
updated_date: '2026-10-26T13:27:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The critical path of Agent workbench and Board viewer is one whole solve (native critical_path example on feat/faster-first-render: 482 and 541 ms). Its wrap search (crates/archboard-layout blocks/wraps.rs) makes 8 or 9 sink checks one after another, each a Graphviz call, and Board viewer keeps no wrap. docs/design/first-render-critical-path.md, 'What still stands between them and 500 ms', estimates the path at the stack prefix plus the slowest candidate, near 300 ms native, if the candidates are solves of their own asked at once through the Solver port. It costs more CPU and changes the solve protocol. The same whole solve is also what a re-render after a card grows waits for (860 to 940 ms through the pool). The owner's goal is real-time scene changes, with complex boards under 500 ms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The native critical path of Agent workbench and Board viewer falls, measured with the critical_path example before and after
- [ ] #2 The order of the asks, the call-off of unneeded candidates and the failure paths are held by tests in crates/archboard-layout
- [ ] #3 Every drawing of the corpus is unchanged
- [ ] #4 timing.ts first renders and a re-render after a card grows are measured through the pool, alternating with the parent commit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Measured on b39ce7afa (native critical_path, temporary trace): Agent workbench's critical solve is the whole solve laid stacking=false: the root block's stack prefix 252 ms (3 Graphviz calls), then 8 sink checks in a row (35-47 ms each, 326 ms), all sink, then 6 ms. Board viewer: prefix 311 ms, 8 sink checks 365 ms, all sink. The partial solve of the chosen stacking way lays exactly that prefix and stops, so it can already tell the wrap candidates of that block.
Design (cheaper than shares that each redo the prefix):
1. A partial solve tells, with what its block stood at, the wrap search that block would make: the score it must beat and each candidate (the grid, or a lowered plan with its columns), in the order the search weighs them (archboard.blocks.wraps).
2. The whole solves the stacking choice asks lay that block with no wrap (archboard.blocks.wrap=none): no sink checks. Every other wrap search of the solve is unchanged.
3. Once the partial solves choose, the choice asks one solve per candidate at once (archboard.blocks.wrap=<candidate>). It skips the block's prefix, tries only its candidate, and answers no drawing when the candidate sinks, else the board laid with it and the candidate's weighing (archboard.blocks.wrapped).
4. The choice folds the standing candidates in search order by the search's own comparison; if the best beats the score, its solve's drawing, else the no-wrap whole. A winning candidate calls the no-wrap whole off. Both stacking paths (answered at once and speculated) ask the same graphs, so the pool's solve memory still hits.
5. Tests in crates/archboard-layout/tests/async_solves.rs: order of the asks, the call-off, failure paths. Measure native critical_path, timing.ts through the pool alternating with b39ce7afa, a re-render after a card grows; corpus compare; docs/design/first-render-critical-path.md section.

6. Revised after measuring: a candidate that cannot beat the score stops once weighed. A partial solve that answers first asks the candidates of its way at once. Groups nesting is not split. The stacking choice moved to architecture/stacking.rs, because choosing.rs passed 600 lines. Board: Renderer layout@TASK-548.06, adopted.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on b39ce7afa with a temporary trace in the native critical_path example (not committed). Both critical solves are the whole solve that the stacking choice chose, drawn inline. The root is the first block that can stack. Agent workbench: stack prefix 252 ms, then 8 sink checks one after another, 326 ms, all sink, then 6 ms. Board viewer: prefix 311 ms, 8 checks 365 ms, all sink, then 8 ms. The partial solve of the same way lays the same prefix and then stops. So it knows the candidates.

Design (crates/archboard-layout):
- The partial solve tells the wrap search of its block in archboard.blocks.wraps: the score to beat and the candidates in search order.
- Drawn inline, the whole solves of the stacking choice lay that block with no wrap (archboard.blocks.wrap = null).
- When a partial solve answers first, its way asks one solve per candidate at once. When it answers last, its way asks them only if the choice keeps it.
- A candidate solve (archboard.blocks.wrap = candidate and score) skips the prefix of the block and tries its one candidate. If the candidate sinks a card, it answers no drawing. If the candidate cannot beat the score, it answers only its weighing. Otherwise it answers the board laid with the candidate, and its weighing (archboard.blocks.wrapped).
- The choice weighs the answers in search order with the comparison of the search itself (wraps.rs kept_of, which the search in a solve also uses). The drawing of a kept candidate replaces the whole solve, and the whole solve is called off. The way that is not chosen is called off with its candidates.
- Groups nesting is not split. On Agent workbench its partial and whole solves took 90 to 134 ms, and the split added 12 solves with no gain.

Decision: one solve per candidate, not shares of candidates. Each share must lay the prefix of 250 to 310 ms again. The partial solve already holds the prefix.

Measured and dropped: the first version asked the candidates only after both partial solves answered, and each standing candidate laid the whole board. Agent workbench went from 496 to 543 ms native.

Native critical path (critical_path example, best of 3 rounds, timing.ts requests). About 15 orphaned bun.native processes of worktree t3-aeb72cc3 spin one core each and kept the box at load 21 to 35. The parent and branch binaries were built once and run alternately.
- Parent at load 11: AW 496 ms, BV 557 ms.
- Alternating at load 30 to 34: parent AW 688 to 821, BV 867 to 928. Branch AW 503 to 648, BV 605 to 765.
- Branch at load 21: AW 394, BV 430. At load 28: AW 367, BV 435.
- Solves: AW 11 to 19, BV 8 to 16. Solve CPU stays near the parent, because the whole solves make no sink checks.
- New path of BV: the partial solve of the stacked way. The choice waits for it, and keeps the plain way.
- New path of AW: one of two. First, a joins solve of the groups nesting with blocks apart, about 360 ms on the parent at load 11. It makes a full wrap search of about 220 ms that keeps a wrap, and no partial solve tells that search. Second, the plain partial solve and then its one standing candidate (156 + 238 ms at load 21).

Pool, timing.ts 7, alternating with b39ce7afa, core rebuilt for each run. First total / AW / BV in ms, load at start:
- parent 11380 / 1858 / 1158, load 32.8
- branch, early version that also split groups, 11380 / 1885 / 1213, load 29.6
- branch 7958 / 1500 / 991, load 21.4
- parent 13860 / 1863 / 1742, load 28.5
- branch 14776 / 2728 / 1673, load 34.8
- parent 13429 / 2091 / 1174, load 29.0
At this load there is no reliable signal. The pool starts one worker at a time and sends solves in the order they were asked. On a cold pool the candidates wait behind longer solves (TASK-548.05).

Re-render after a card grows (scratch script, deleted): render the board, then the same content with one card name made one line longer (Workhorse queue, Camera arithmetic). AW / BV in ms: parent 1911 / 1685, branch early 1305 / 1240, branch 1104 / 1038, parent 2527 / 1773, branch 1623 / 1744, parent 1715 / 1615.

Corpus: the parent was rendered from b39ce7afa sources in this worktree (git apply -R of the work, core rebuilt) to /tmp/548-06/base. 0 of 2,344 drawings differ, after the first version and after the final protocol. Across the 23 timing.ts boards the split keeps a candidate on Archboard, Board rasterizer and Browser application. So the corpus covers kept wraps as well as the no-wrap outcome.

Tests in crates/archboard-layout/tests/async_solves.rs:
- partial_solves_answered_at_once_ask_the_chosen_whole_and_then_each_wrap_alone: the order of the asks.
- a_partial_solve_answering_first_asks_its_wraps_and_the_way_not_chosen_is_called_off: the early asks and the call-off, in both answer orders.
- the_wrap_the_search_keeps_draws_and_calls_off_the_whole_with_no_wrap: the choice in either answer order, and the call-off of the whole solve.
- with_no_wrap_kept_the_whole_with_no_wrap_draws.
- a_failed_wrap_or_whole_answers_at_once_and_calls_off_every_solve: the failure paths.
Three mutations of choosing.rs each made the matching test fail.

Boards: the proposal Renderer layout@TASK-548.06 changes the description of Choice between solves. Compare shows one field and no interface change. archboard check --code --variant TASK-548.06: the two Renderer layout findings (EXPOSED_UNUSED InProcess and Laying, CALLER_UNDRAWN Crossing pass) existed before this task.

Correction: the stacking choice now lives in crates/archboard-layout/src/architecture/stacking.rs. Four mutations of that file (the early asks, the kept wrap, the failure of the whole solve, the inline-only gate) each made the matching test fail.

Gate, one lane at a time, at load 29 to 35 (core 6e1a5ec587b32904 for the last lanes):
- lint:all (tests, policy, css, clippy for wasm with deny warnings, rustdoc with private items): pass.
- format:check and format:core: pass.
- types and frontend: pass.
- test:core (cargo test --locked --workspace): 190 passed, 0 failed.
- test:modules: 4820 pass, 1 skip, 0 fail.
- test:repository: 150 pass, 0 fail.
- test:serial-browser: pass.
- test:system: 256 of 257 in each of three runs. Each run failed a different timing-sensitive process test: resource-cleanup (TERM-resistant peer), semantic-move (pane follows a moved board), board-lock-api. Each file passed alone at load 30 to 33. None of them touch layout.
Corpus on core ca77570fd7af78d7, built from the final layout sources (only the test file changed after it): 0 of 2,344 drawings differ.
<!-- SECTION:NOTES:END -->
