---
status: proposed
---

# Group regions are packed before solving

TASK-548.08 proposes this change on 2026-10-26.
The grading council of TASK-548.09 decides whether its changed drawings can land.
This decision replaces the group-packing competition in the host contract of ADR 0059.
It keeps the Rust core, Solver port, worker pool, and vendored Graphviz of ADR 0060.

## Context

Track draws containers inline.
A board with group regions also runs a competing layout with each region packed as a separate block.
The core waits for both layouts before it decides which drawing to keep.
A region is the boundary around parts that share a configured group.

The current slow boards ask 24 to 27 solves in a first render.
The longest paths lay the full inline graph and then a wrap of that graph.
A size-changing edit repeats those paths because the graph dimensions change.
The owner targets renders below 500 ms and permits changed drawings that the council accepts.

A Solver-port probe chooses group packing before solving.
It preserves the complete Board viewer and Board persistence SVGs byte for byte.
The Archboard server routes drawing changes its spacing and order.
A visual inspection finds no obvious regression in that drawing.
The corpus and drawing-integrity results determine whether this proposal remains viable.

## Decision

Track chooses nesting from the measured graph before it asks for any solve.
If the graph contains a group region, Track packs each region as a block.
Otherwise, Track keeps its containers inline.
Blocks continues to pack containers and group regions.

The competing whole-board nesting and its comparison disappear.
The core requests drawing readings only for the remaining choices that consume them.
Joins, stacking, and wrap choices keep their existing contracts.
The host still schedules solves through the Solver port and keeps its bounded memory of solve answers.

The code retains no switch to the old nesting competition.
Saved baseline binaries, source copies, and corpus outputs provide the comparison during this task.
The parent can reject this commit if the council finds a worse drawing.

## Consequences

A render no longer waits for an inline layout that loses the nesting comparison.
Graphviz works on separate group blocks instead of one large graph across those regions.
The choice depends on group membership rather than the order or duration of worker replies.

Some drawings change because packing no longer needs to win the old comparison.
The council must judge each changed drawing, and geometric defects remain failures.
The design note records the complete corpus, instruction counts, pool timings, and remaining work.
