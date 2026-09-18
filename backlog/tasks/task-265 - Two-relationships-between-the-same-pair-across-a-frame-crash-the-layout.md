---
id: TASK-265
title: Two relationships between the same pair across a frame crash the layout
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 10:52'
updated_date: '2026-09-18 11:52'
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
- [ ] #1 A board with two relationships between the same ordered pair, one end inside a container, rasterizes instead of failing
- [ ] #2 The sister relationships stay distinguishable where they cross the frame rather than being drawn over each other
- [ ] #3 The boards preserved under .skill-evals/2026-09-18T01-50-12-580Z/runs/candidate/S05/1 and /2 render
- [ ] #4 A renderer owner covers the shape, so the crash cannot return silently
- [ ] #5 What TASK-258 fixed still holds
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
<!-- SECTION:NOTES:END -->
