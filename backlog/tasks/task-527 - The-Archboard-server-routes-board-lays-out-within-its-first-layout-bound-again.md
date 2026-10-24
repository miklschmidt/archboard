---
id: TASK-527
title: The Archboard server routes board lays out within its first-layout bound again
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-24T19:57:00Z'
updated_date: '2026-10-24T20:59:00Z'
labels:
  - renderer
dependencies: []
references:
  - packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts
priority: high
type: bug
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-526.04 was adopted on 2026-10-24, the current variant of the dogfood board Archboard server routes gained the Track embed route part, a reworded Board writes part and five relationships. Its first track layout in packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts now takes about 3970 to 4040 ms against the 3000 ms LOADED_LAYOUT_BOUND_MS, reproducibly and alone (load 1.9). With the board as it was before that adoption (commit 83c9a7490^), the same case passes. The bound stands for what a pane waits for a first layout, and TASK-512 already kept this board within the render budgets once. The gate (bun run check) fails until this is repaired.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Archboard server routes (track) case of wide-boards.test.ts passes its first-layout bound alone and inside bun run check
- [ ] #2 The bound itself and every other assertion of the test are unchanged
- [ ] #3 The board still draws what the code does: archboard check code reports no new finding on it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Profile the first Track layout of Archboard server routes per solve and per phase.
2. Remove waste every board pays: the engine pool's cold start, and the first stackable block laid twice on the way to the drawing.
3. Prove every Track drawing unchanged by hashing every vault board and fixture before and after.
4. If the case still misses its bound, find further waste in the stacked solve's wrap weighing or routing; a board change only through a TASK-527 proposal.
5. Run the renderer tests and the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Profile before (load 1.9, alone): 7 solves. Stacking partials ran 601 and 835 ms, then a whole stacked solve 2651 ms (in-thread 2.4 s): critical path 866 + 2651 ms, plus 380 ms painting. The whole stacked solve: stackedOrNot 550 ms (root laid tied plus two remedies), wrapScoring 1.9 s (6 wrap plans, 8 lined up, 3 routed, each with both remedies: 12 routings at about 125 ms and 17 Graphviz runs at about 47 ms). TASK-526.04 flipped the root's stacking choice from plain (whole solve 0.55 s, every wrap sinks before routing) to stacked (wraps route); the old board laid stacked takes 1.95 s too. No single quadratic hot spot: routing self time is spread (crossingsOf/meetsAt 150 ms, sweep DP 120 ms, laneRuns 45 ms).
Waste found: (a) the pool started its second worker only after the first answered its first solve, so solves 1 to 3 waited behind solve 0 (600 ms); (b) the stacking choice laid the first stackable block in a partial solve and again in the whole solve after it.
Fix 1f6c8f9e5: a worker says ready once its engine is loaded; both stacking ways run as whole solves that tell their stood mid-solve, the renderer chooses then and the pool stops the dropped way's worker. Every Track drawing of the vault and fixtures is byte-identical (SVG hashes). Case alone: 3.01 to 3.07 s (was 4.0 s). Warm whole-vault Track times: Agent workbench 2970 to 1953 ms, Board viewer 2599 to 1432, Archboard server routes 2952 to 2577.

After 1f6c8f9e5, in the test (cold pool, alone): workers ready about 60 ms apart; the stacked whole solve runs 269 to 3045 ms (2776 ms; 2.45 s in a cold worker alone, 2.4 s in-process; the rest is four other workers starting beside it); painting and bridging 210 ms. Case alone 3.01 to 3.07 s (load 1 to 2): still over 3000 ms. Case in a whole-file run, as the gate runs it: 2.70 s, and all 40 cases of wide-boards.test.ts pass (91.9 s).
Measured and not kept: (1) choosing a wrap on its first layout and remedying only the chosen one: stacked solve 1.76 s, case alone about 2.3 s, but measure.ts ALL=1 shows 5 changed variants, 3 reading worse (Command interface TASK-472.09 crossings 58 to 66, Command dispatch TASK-368.05 0 to 2, TASK-436.12 more bends and length); Blocks unchanged. (2) jogs.ts save() reading lane runs once, parting.ts counting pairs lazily: about 2% each, reverted. (3) one wrap candidate per solve, side by side (simulated): slowest candidate 1.5 to 2.2 s against 2.9 s with nine cold workers; needs a new told-weight protocol and is slower on few-core runners; not built.
The board is unchanged: Track embed route and its five relationships are drawn exactly as its sibling routes (mounts, write envelope, store under lease, requires a vault, CLI call), so drawing less would make the board say less than the code. archboard check code: the board's four RELATIONSHIP_UNDRAWN warnings name Repository routes, Browser, Codex workbench and Semantic board store, none Track embed route; this task changed no board. No board proposal: Engine pool, Layout engine and Bun host keep their roles (Semantic renderer, Renderer layout boards).

Gate at f7171a2a2: bun run check exit 0 (test:modules 4929 pass 1 skip 0 fail; test:system 281 pass; test:repository 136 pass; serial browser 19 of 19 files), load 2.6 to 2.8. Afterwards the case alone: 3036, 3080, 3037 ms (load 2.0). AC #1 holds inside the gate (2.70 s in the whole-file run) but not alone; the parent must decide between a non-exact wrap choice, side-by-side wrap solves, or accepting the cold-alone overrun.
<!-- SECTION:NOTES:END -->
