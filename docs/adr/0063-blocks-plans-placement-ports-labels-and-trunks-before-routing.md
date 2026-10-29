---
status: proposed
---

# Blocks plans placement, ports, labels and trunks before it routes

TASK-554 proposes this decision on 2026-10-28.
The owner approved the direction after five Blocks explorations.
The complete implementation still needs corpus, speed, and visual council acceptance.

Blocks will create one deterministic plan from measured content before it emits routes.
The plan chooses local dependency order, reading direction, all four endpoint walls, route-owned label positions, and explicit shared trunks.
It reserves the corridors and their capacity before it packs the final blocks.
Packing compares measured sizes and the routes that those planned ports require.
Channel routing then assigns lanes inside that reserved space.
A bounded local grid search handles exceptional junctions while preserving locked obstacles, ports, and prior lanes.
A conservative channel plan handles search exhaustion without an unchecked route.
Each child exports complete routes to its boundary before the parent reserves its channels.
Crossings contribute to cost when straight approaches keep them clear of labels, bends, and arrowheads.
A crossing does not require legacy placement.

A shared trunk must name the source or target common to every member relationship.
Coincident ports and pairwise compatibility cannot establish that identity.
Trunk compatibility includes the visible kind when removed comparison context changes an overview’s majority kind.
Each label remains part of one real relationship and receives no arrowhead or semantic node ID.
Each label sits at the midpoint of its longest straight run between source and target.
The run can be horizontal or vertical, while the words remain horizontal.
A line never gains a bend to reach a source-side label slot.
The label stays inside one containing scope and clear of foreign lines and frame walls.
Each downward dependency rank forms one row, with acyclic targets below their sources.
All scopes expose peer-facing portals, including the largest scopes.

This replaces the Blocks placement, facing, settlement, fold, wrap, and route-repair sequence described in ADRs 0033, 0040, and 0061.
Those decisions retain their Track clauses.
ADR 0062 still supplies exact normal header sizes.
The Rust core, text shaping, scene, Solver interface, worker pool, and vendored Graphviz remain under ADRs 0059 and 0060.
Graphviz can provide local rank hints, but it does not own the complete compound drawing.
Planned crossing decoration handles at most 128 crossings with four fixed-radius arc attempts each.
Later crossings retain plain crossing and junction cuts.
The atlas uses the frozen routes with fixed decoration padding.
The planner owns every Blocks architecture class after step 8.
The temporary dispatcher and Blocks-only repair paths are removed.
Track retains the legacy modules that it needs and must remain byte-identical.

The explorations reject isolated packing changes, post-placement side-port repair, distant label relocation, and unrestricted whole-graph layered placement.
Each improves one measure while retaining or worsening another cost.
Planning puts those costs in one place before route geometry becomes final.
The private plan adds an internal data structure but removes repeated whole-hierarchy decisions and post-route repairs.

The [design](../design/blocks-planned-layout.md) defines the plan, cost, fallback bounds, module replacement, and staged adoption gates.
Its conservative spike proves horizontal label ownership and planned channels on the six references.
It does not prove compactness, full fan behavior, four-wall optimization, or the 500 ms end-to-end target.
Its weak pictures and failing legacy tests prevent production adoption of that spike.
This ADR proposes the complete design, not direct adoption of the research branch.

The implementation retains compact source cells when their departures pass the ownership and clearance guards.
Other fans use staggered source labels within measured cells.
Declared flow points and self-loops follow the same complete geometry contract.
Conservative scopes retain two child shapes and compare at most six local candidates.
Small scopes share a twelve-candidate limit with the normal planner.
These bounds do not establish visual acceptance.
The implementation evidence and remaining compactness costs belong to the design checkpoint and build report.

The step 8 corpus draws every Blocks architecture reading without legacy placement.
It removes all twenty-three baseline geometry findings and preserves every Track SVG.
All three large references render first layouts and growing edits below 500 ms, including painting.
Mean area and route length still exceed the baseline, and the six pictures do not establish better readability.
This decision remains proposed until the compactness and visual acceptance gates pass.

The owner revised the readability contract on 2026-10-29.
Iteration 3 tested route-centered labels, dependency rows, local rank alignment, and wider portal choices.
Neither rendered trial improved all six references against the original baseline.
Those layout changes were rejected, and the step 8 implementation remains intact.
This revision records the required direction without claiming that the retained code implements it.
