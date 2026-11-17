---
status: accepted
---

# Blocks keeps legacy placement and plans its routes

Amended on 2026-11-09. The dense placement states one cost and searches for the placement that costs least.
That cost replaces the rules of TASK-559.09, which chose each door's wall by the room the page costs.
Simulated annealing from a fixed seed moves the parts between the cells of each frame's grid, and starts from the grid's greedy answer.

TASK-554 proposes this decision on 2026-10-28 and revises it on 2026-10-29.
The owner selected the hybrid direction after three iterations failed to improve the six reference pictures with planner-owned placement.
The legacy placer composes the boards better, while planned routing supplies explicit ownership, complete geometry guards, and bounded search.

Legacy Blocks placement owns card positions, dependency order, packing, frames, folds, and wraps.
The planner replaces Blocks routing, including the old trunk router and its unrestricted grid search.
The placer can respond to the new routes with smaller gaps.
A placement change must improve the reading and pass the reference gates.

The planner routes fixed measured geometry through four-wall ports, private lanes, and explicit source and target fans.
Every shared run names one endpoint common to all its members and preserves the full line treatment.
Pairwise compatibility alone cannot establish trunk ownership.
A source fan only splits, and a target fan only merges.
Local conflict repair and grid windows have explicit work limits.
A failed candidate can request bounded extra room from the legacy placer.
No unchecked route reaches the painter.

After selecting routes, the planner closes the space that nothing uses while preserving card sizes, route topology, and clearance around bends and boundaries.
It applies the same complete geometry guard.
A rejected contraction retains the original geometry through that guard.

Each label belongs to one real relationship and receives no semantic node ID or arrowhead.
A route never gains a bend to reach a label slot.

The complete geometry guard protects cards, headers, captions, walls, labels, endpoints, and fan ownership before emission.
It also refuses a route that crosses or touches its own ink, because no hop can mark where a line crosses itself.
The Solver interface, text shaping, Rust core, worker pool, and Graphviz remain under ADRs 0059 and 0060.
A pool of several workers lays a dense reading out in parts across them, and the core makes the choice of one solve from their answers ([ADR 0078](0078-a-blocks-solve-is-laid-out-in-parts-across-the-layout-workers.md)).
Track retains its existing behavior and must remain byte-identical.
ADRs 0033, 0040, 0061, and 0062 retain their placement and measured-header decisions.

The original proposal replaced placement as well as routing.
It increased mean area and route length.
Iteration 3 rejected its readability trials because none passed all six references.
The hybrid removes that planner-owned placement and keeps its useful routing and guard contracts.

TASK-554 records the work limits, historical trials, and acceptance gates.
The owner accepted this direction on 2026-10-30 and selected Blocks as the default in ADR 0064.
