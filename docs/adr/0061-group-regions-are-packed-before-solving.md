---
status: proposed
---

# Large graphs pack group regions before solving

TASK-548.08 proposes this change on 2026-10-26.
The grading council of TASK-548.09 decides whether changed drawings can land.
This decision replaces the group-packing competition in ADR 0059 for large graphs.
It keeps the Rust core, Solver port, worker pool, and vendored Graphviz of ADR 0060.

## Context

Track draws containers inline.
A board with group regions also runs a competing layout with each region packed as a separate block.
The core waits for both layouts before it decides which drawing to keep.
A region is the boundary around parts that share a configured group.

The current slow boards ask 24 to 27 solves in a first render.
The longest paths lay the full inline graph and then a wrap of that graph.
A size-changing edit repeats those paths because the graph dimensions change.
The owner targets renders below 500 ms and permits drawings that the council accepts.

Unconditional packing cuts the measured native work by 75.8%, but it fails nine renderer cases.
It introduces a wall-hug defect and worsens a compact Walkthrough video drawing.
Forcing compact graphs inline instead fails three other reduced fixtures that need packing.
Both forms remain necessary for compact drawings.

## Decision

Track counts the leaf cards when it finds group regions in the measured graph.
A leaf card is a part with no drawn children.
At 32 leaf cards or more, Track packs regions before it asks for a solve.
The competing whole-board inline nesting is omitted for these large graphs.
Below that boundary, the existing nesting comparison remains bounded to compact graphs.
The boundary is an initial performance heuristic, not a proof of drawing quality.

The compact comparison preserves the existing geometric and reading contracts.
A graph without regions keeps its inline nesting.
Blocks continues to pack containers and group regions.
Joins, stacking, and wrap choices keep their existing contracts.
The host still schedules solves through the Solver port and remembers bounded solve answers.

There is one core and no comparison switch or second implementation.
Saved baseline binaries, source copies, and corpus outputs provide the task evidence.
The parent can reject this decision if the council finds a worse drawing.

## Consequences

Large grouped graphs no longer wait for an inline layout that loses the nesting comparison.
Compact graphs retain the choices that the reduced regression fixtures require.
The decision depends on the measured graph rather than worker timing or board names.

The existing tests cover both sides of the size boundary and solve failures.
The corpus and full-size source drawings provide before-and-after evidence.
The design note records the measurements, rejected rules, and remaining work.

TASK-548.10 owns trunk ambiguity and routing defects.
This decision changes nesting selection and does not rebuild bundling or routing.
