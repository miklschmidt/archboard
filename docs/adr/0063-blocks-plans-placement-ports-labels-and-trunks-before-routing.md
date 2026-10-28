---
status: proposed
---

# Blocks plans placement, ports, labels and trunks before it routes

TASK-554 proposes this decision on 2026-10-28.
The owner approved the direction after five Blocks explorations.
The complete implementation still needs corpus, speed, and visual council acceptance.

Blocks will create one deterministic plan from measured content before it emits routes.
The plan chooses local card order, reading direction, all four endpoint walls, source-owned horizontal label slots, and explicit shared trunks.
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
Every label stays near its source, on its own horizontal run, inside one containing scope.

This replaces the Blocks placement, facing, settlement, fold, wrap, and route-repair sequence described in ADRs 0033, 0040, and 0061.
Those decisions retain their Track clauses.
ADR 0062 still supplies exact normal header sizes.
The Rust core, text shaping, scene, Solver interface, worker pool, and vendored Graphviz remain under ADRs 0059 and 0060.
Graphviz can provide local rank hints, but it does not own the complete compound drawing.
Planned crossing decoration uses at most four fixed-radius arc attempts per crossing.
The atlas uses the frozen routes with fixed decoration padding.
Track must remain byte-identical.

The explorations reject isolated packing changes, post-placement side-port repair, distant label relocation, and unrestricted whole-graph layered placement.
Each improves one measure while retaining or worsening another cost.
Planning puts those costs in one place before route geometry becomes final.
The private plan adds an internal data structure but removes repeated whole-hierarchy decisions and post-route repairs.

The [design](../design/blocks-planned-layout.md) defines the plan, cost, fallback bounds, module replacement, and staged adoption gates.
Its conservative spike proves horizontal label ownership and planned channels on the six references.
It does not prove compactness, full fan behavior, four-wall optimization, or the 500 ms end-to-end target.
Its weak pictures and failing legacy tests prevent production adoption of that spike.
This ADR proposes the complete design, not direct adoption of the research branch.
