---
id: TASK-265
title: Two relationships between the same pair across a frame crash the layout
status: Done
assignee:
  - '@claude'
created_date: '2026-09-18 10:52'
updated_date: '2026-09-18 12:41'
labels: []
dependencies: []
references:
  - src/transformers/semantic-renderer/lib/layout/compound-graph.ts
  - src/transformers/semantic-renderer/lib/layout/reading.ts
  - src/transformers/semantic-renderer/tests/route-nesting.test.ts
  - TASK-258
priority: high
type: bug
ordinal: 472000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board renders nothing when two relationships share the same ordered endpoints and exactly one endpoint is inside a container: ELK refuses the graph with 'org.eclipse.elk.core.UnsupportedConfigurationException: Expected 1 hierarchical ports, but found only 0' and the whole rasterize exits 1. It cost two runs of the 2026-09-18 batch their visual verdict and withheld S05 from the cost comparison; the semantics were correct and saved, only the picture was impossible.

Reproduced deterministically from the preserved worlds under .skill-evals/2026-09-18T01-50-12-580Z/runs/candidate/S05/{1,2}, whose boards hold 'Flask.wsgi_app' inside a 'Flask app' container with both a 'push' and a 'pop' relationship to the top-level 'Request context'. Minimised: adding a second 'Flask.wsgi_app -> Request context' relationship to the passing candidate/S05/3 board reproduces it; the reverse direction does not, a second relationship to a different outside part does not, and the same duplicate pair with both ends inside one parent does not. The self-referencing edge the grader suspected is innocent.

It is a regression from c4a9236d (TASK-258): both failing boards render at c4a9236d^. crossingsOf sets straight = hasSister(seat) (src/transformers/semantic-renderer/lib/layout/compound-graph.ts:392), and crossingFace(face, header, true) then returns farFlank() (src/transformers/semantic-renderer/lib/layout/reading.ts:237-240), putting the boundary port on a lateral face of the frame — which facesOf's own comment at compound-graph.ts:204 already records as a hierarchical port the engine's node placer refuses.

The fix belongs in archboard, not in the forked renderer at /home/msc/Projects/elk-rs (`@archboard/elk-rs` 0.11.3). The panic at plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/p3order/layer_sweep_crossing_minimizer.rs:1423 is a faithful port of upstream ELK, which throws the identical IllegalStateException from the same function at external/elk/plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/p3order/LayerSweepCrossingMinimizer.java:533. The engine is refusing an invalid graph rather than failing to lay out a valid one, so elk-rs needs no change and archboard must stop handing it a frame whose hierarchical ports do not account for the crossings in its boundary layer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A board with two relationships between the same ordered pair, one end inside a container, rasterizes instead of failing
- [x] #2 The sister relationships stay distinguishable where they cross the frame rather than being drawn over each other
- [x] #3 The boards preserved under .skill-evals/2026-09-18T01-50-12-580Z/runs/candidate/S05/1 and /2 render
- [x] #4 A renderer owner covers the shape, so the crash cannot return silently
- [x] #5 What TASK-258 fixed still holds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce from the preserved world and minimise: five nodes, four relationships. DONE.
2. Establish the mechanism by dumping the ElkNode graph and mutating the frame's boundary-port faces over all sixty-four combinations. DONE — the description's account is wrong; see the notes.
3. Choose the repair against what TASK-258 bought. Options (a) the frame rule outranks the sister rule and (b) the sisters keep a legal face were both measured and both draw the pair crossing itself; option (c), one shared corridor, is what landed.
4. Implement: a frame crossed both down a flank and straight through is crossed straight through once per face, the routes sharing a face there sharing the corridor. The frames a route crosses move to their own file with the rule that reads them all together. No change to @archboard/elk-rs.
5. Verify: the new owner and the whole renderer suite, the rasterizer and rasterize system owners, type-check, lint and format on what changed, and both preserved boards rasterized end to end.
6. Establish whether any route moved elsewhere.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Step 2, mechanism: the account in the description is wrong. Dumping the ElkNode graph compound-graph hands the engine, for a 5-node/4-edge minimisation of the failing board, shows the two sister crossings sitting on SOUTH, not on farFlank(): crossingFace(SOUTH, NORTH, true) returns SOUTH because SOUTH is not the header face. The only lateral-face port on the frame is the driver relationship's boundary port, 'z:boundary:0@WEST', which comes from the long-standing CLEAR_OF_BAND rule for a route entering a frame by its NORTH face, not from TASK-258.

Minimal repro (renderArchitecture alone, no CLI): frame 'app' holding 'emit' and 'disp'; top-level 'srv' and 'ctx'; relationships srv->emit, emit->ctx twice, emit->disp. Dropping any one of those four, or reversing the sister pair, or moving 'ctx' inside 'app', renders. So the crash needs BOTH a relationship entering the frame (which takes a WEST boundary port) and two relationships leaving it by SOUTH: 'app' then carries ports on WEST, SOUTH, SOUTH and none on NORTH.

Hypothesis to confirm next: the engine lays out DOWN, so internally NORTH/SOUTH are the flow faces and the frame's WEST port is a lateral (north/south) external port. sweep_in_hierarchical_node takes the first layer of the frame's nested graph, finds its first node is an external-port dummy, and calls sort_port_dummies_by_port_positions(frame, layer, side_opposed_sweep_direction) which only counts hierarchical ports on that one side; the frame has none there, so it panics 'Expected 1 hierarchical ports, but found only 0'. That is elk-rs faithfully porting upstream ELK, so the repair is archboard's: stop handing the engine a frame whose boundary ports leave its sweep-side layer unaccounted for.

Step 2 settled, by mutating the three boundary-port faces of the minimal board's frame over all sixty-four combinations and solving each on the engine. Refused: two ports on one face the reading runs along together with one on a flank (NORTH,NORTH,flank and flank,SOUTH,SOUTH, either flank). Accepted: every other combination of the three, including all three on flanks — which is how every crossing was made before TASK-258 — and all three on one such face. So the hazard is the combination, not any one port, and the far flank TASK-258 keeps for a pair into a frame does not rescue it.

Step 3, the repair and why. (a) The frame rule outranking the sister rule was implemented and measured: bundled down the far flank, the pair crosses itself, and the new owner failed on exactly that. Bundled down the near flank it crosses itself too, which is what TASK-258 measured. So no flank keeps the pair's order and options (a) and (b) are both out. (c) landed: a frame crossed both down a flank and straight through is crossed straight through ONCE PER FACE, and the routes sharing a face there share the corridor. One port is never two on one face, so the engine accepts the frame; a pair through one corridor has nothing left to order, so it reads through the frame in the order it leaves by and meets only at the single point it crosses. A frame nothing bundles down keeps a port per crossing, so every drawing TASK-258 measured is untouched.

Changed: src/transformers/semantic-renderer/lib/layout/frame-crossings.ts (new: the frames a route crosses, the face of each, the crowded-frame rule and the port id), src/transformers/semantic-renderer/lib/layout/compound-graph.ts (settles every relationship's attachment before any port exists, so a frame's crossings can be read together), src/runtime/semantic-renderer/tests/route-nesting.test.ts (a sixth pair shape: a frame the group leaves that another route also crosses), docs/design/layout-rules.md section 27. Nothing in @archboard/elk-rs.

Verified: the minimal board and six variations of it that all refused before now render, both readings; all 223 renderer tests over 34 files pass, the 16 route-nesting cases among them; the rasterizer owner (11) and the rasterize system owner (3) pass; type-check, the type-aware lint over src/transformers/semantic-renderer, the baseline lint over the test folder and oxfmt are clean. Both preserved boards rasterize end to end to a PNG, architecture and data-flow grammars, having exited 1 before.

Step 6: no route moved anywhere else, and not by inspection — a crossing is only ever straight when its relationship has a sister, so with no sister on a board the crowded-frame rule cannot be reached at all. No vault board, variant or fixture holds two relationships between one ordered pair: 22 drawings scanned (15 vault boards, 18 variants, 4 wide-board fixtures), 0 with a shared ordered pair, and all 22 still render.

Round 2, after review. Three must-fix items addressed.

1. AC#2 was not met and now is. Sharing a corridor draws the sharers through one point, and the engine then drew them along one line either side of it: measured 84 units of one ink for the pair on the preserved S05/1 board and 418 on S05/2, and 99.5 in the new owner's own shape. A run two routes are drawn on top of each other along is now fanned apart after the routes are placed and before they are rounded (src/transformers/semantic-renderer/lib/layout/shared-runs.ts, called from drawingEdges): each onto a lane of its own at the engine's own parallel spacing, each keeping the side it approached from so the fan cannot make two routes cross, and stepping out a lane again where another route is already drawn along the one it asked for. That last part was needed: the first fan traded the pair's overlap for a 40-unit overlap between a sister and an unrelated route on S05/1. Measured now over every relationship of all 24 drawings in the tree — 15 vault boards, 18 variants, 4 fixtures and both preserved boards — the worst overdrawn run is 0, and none of them has a route through a card. Rasterized and looked at both preserved boards: push and pop are two parallel lines with their own labels and arrowheads.

2. The owner could not see it, and now can. The reviewer is right about crosses(): routeCrosses/segmentMeets use strict inequalities, so a zero-width box meets nothing and two collinear routes never cross however exactly they coincide. Added overdrawnRun() to drawn-ink.ts beside routesThroughCards — the longest stretch two of the named routes are drawn within a hair of each other on one lane — and the pair shapes now hold it to CORNER (16, a rounded turn's length). Confirmed it fails on the unfanned drawing at 84 and passes at 0.

3. Section 27's rule was wrong and is replaced by the measurement. I re-ran all 64 combinations on the graph the renderer actually builds for the new owner's shape, with the pair's shared corridor split back into a port each: six are refused, not four — NORTH,NORTH,WEST; NORTH,NORTH,EAST; NORTH,WEST,NORTH; NORTH,EAST,NORTH; WEST,SOUTH,SOUTH; EAST,SOUTH,SOUTH — all answering 'Expected 1 hierarchical ports', and identically with the pair's two ports pushed onto the frame either way round. (The reviewer measured four on their reconstruction, with two of mine accepted and a different message; the set differs with the graph, which is itself the finding.) The reviewer's substantive point holds and my own data shows it: SOUTH,SOUTH,WEST and SOUTH,WEST,SOUTH are accepted while WEST,SOUTH,SOUTH is refused, so which route takes which face is the variable and no rule counting a frame's ports can state the condition. Section 27 now gives the tuples literally, says the table is evidence that the configuration the renderer reaches is refused rather than a predicate to test a frame against, records that the crowded trigger is deliberately wider than the table, says what a reader sees where two unrelated pairs leave one frame, and closes the option space with why the bundling route cannot cross straight (section 11 forbids a crossing across the title band).

4. Optional seam taken. frame-crossings now answers one question — given every relationship's faces and seat, where each crosses and which boundary port it takes — and keeps Boundaries, the crowded-frame rule and the spelling of a port id to itself; the graph builder's two-phase attachment dance is gone. PortSides moves to reading.ts beside Face. No change to the graph handed to the engine.

Re-verified after all of it: 223 renderer tests over 34 files pass, the rasterizer owner (11) and the rasterize system owner (3) pass, type-check clean, both lint lanes clean over what changed, oxfmt clean, and both preserved boards rasterize in both grammars.

Round 3, the last correction. Section 27's table printed six rows under a tuple convention that names the pair, which reads as six configurations when it is four: the two rows of each NORTH pair are one picture with the pair named the other way round, and what the engine answers to is which sister it seats first along the source's face — an outcome of the solve, not a property of the graph. Section 27 now states the condition by geometry (refused when the route in is on NORTH, the sister seated first is on NORTH and the other is on either flank; and when the route in is on either flank and both sisters are on SOUTH; everything else laid out, all three on one flow face and all three on flanks included) and keeps the table as the evidence behind it.

Sweeping every candidate of the board rather than one settled the earlier disagreement, and my own measurement now carries it: the label-stripped candidate the renderer actually solves for an ordinary run refuses four — NORTH,WEST,NORTH and NORTH,EAST,NORTH at 'Expected 2 hierarchical ports', WEST,SOUTH,SOUTH and EAST,SOUTH,SOUTH at 'Expected 1' — and reserving a label on one of the pair gives the same four at 'Expected 1' throughout. Reserving one on both gives the six in the table. So the four are what this shape refuses however it is drawn; the extra two and the count in the message both move with the candidate, a label dummy having moved which sister is seated first. Section 27 says so.

Reviewer notes taken: clearLane no longer has a give-up branch to document — one more step than there are runs must land clear, since each step is a whole lane and a run counts as drawn along one only within a hair of it, so every other run can block at most one step; and moveRun records that a neighbour's stale extent can only refuse a free lane, never take an occupied one. Left alone: LANE sitting under SIDE_BY_SIDE is the intent (a fanned pair is a corridor a reader counts across, which is what section 25 measures), and ancestryOf's home is a one-symbol nit not worth the churn.

Final verification after all of it: 223 renderer tests over 34 files pass (7112 assertions), the rasterizer owner and the rasterize system owner pass (14 tests), type-check clean, both lint lanes clean over what changed, oxfmt clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The task's own account of the crash was disproved. It blamed crossingsOf setting straight = hasSister(seat), so that crossingFace returned farFlank() and put a boundary port on a lateral face of the frame; the captured ElkNode shows the sister crossings sitting on SOUTH, the face they travel, and farFlank() reachable only at the end whose face is the title band. The one lateral-face port is the entering relationship's, from the CLEAR_OF_BAND rule that has bundled a crossing down a flank since section 11 — not from TASK-258. The cited comment at compound-graph.ts:204 is about a frame's own containment relationship, not a boundary crossing.

The real mechanism: a frame crossed both down a flank and straight on through a face is one the engine can refuse outright. It expects the dummies in the frame's own first and last layers to be accounted for by the frame's ports on that one side, and a flank port is on neither, so it answers UnsupportedConfigurationException and the whole board draws nothing. Sixty-four combinations of the three boundary faces, swept on the graph the renderer builds and on every candidate solve of it, give four configurations refused however the board is drawn: the route in on NORTH with the sister seated first at the source on NORTH and the other on either flank, and the route in on either flank with both sisters on SOUTH. Which route holds which face is the variable, so no rule counting a frame's ports states the condition. TASK-258 is first cause only because it is what first puts a non-flank boundary port on a frame; elk-rs is a faithful port of upstream and needed no change.

The repair is two parts, both in the renderer. A frame crossed both ways is crossed straight through once per face, the routes sharing a face there sharing the corridor, so the refused configuration is unreachable (frame-crossings.ts, which now answers that one question for a whole view at once and keeps the boundaries, the crowded-frame rule and the spelling of a port id to itself). Sharing a corridor then draws the sharers along one line either side of the point they share — 84 units of one ink on the first preserved board, 418 on the second — so a run two routes are drawn on top of each other along is fanned apart after the routes are placed and before they are rounded (shared-runs.ts): a lane each at the engine's own parallel spacing, each keeping the side it approached from, stepping out again where another route already runs there. Nothing about the graph handed to the engine changes.

Verified: the new route-nesting shape, a frame the pair leaves that another route also crosses, fails before the fix with the engine's refusal and passes after, at two and three sisters, both edge orders and both themes; drawn-ink's overdrawnRun holds two relationships a reader must tell apart to a corner's length, and was confirmed to fail at 84 on the unfanned geometry. Both preserved boards under .skill-evals/2026-09-18T01-50-12-580Z/runs/candidate/S05/1 and /2 rasterize to PNG in both grammars, 1521x1164 and 1766x1155, and were looked at: push and pop are two parallel lines with their own labels and arrowheads. Over every relationship of all 24 drawings in the tree — 15 vault boards, 18 variants, 4 fixtures, both preserved boards — the worst overdrawn run is 0 and no route passes through a card. What TASK-258 fixed still holds, in code and in the suite: crossingFace returns a flank on both branches without a sister and crowdedFrames only admits a frame through a non-flank side, so a board with no pair hands the engine byte-identical input; no vault board, variant or fixture holds two relationships between one ordered pair. 223 renderer tests over 34 files pass, the rasterizer and rasterize system owners pass, type-check, both lint lanes and oxfmt are clean. Section 27 of docs/design/layout-rules.md records the measurement, what moves with the candidate solve, and why the two alternatives — bundling the pair back down a flank, and letting the entering route cross straight — are not available.
<!-- SECTION:FINAL_SUMMARY:END -->
