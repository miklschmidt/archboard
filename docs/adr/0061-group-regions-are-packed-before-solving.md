---
status: proposed
---

# Group regions are blocks before solving

TASK-548.08 proposes this change on 2026-10-26.
The parent council judges every changed drawing before this decision is accepted.
It replaces the speculative layout choices in ADR 0059 and their global reading comparison from ADR 0039.
TASK-559.16 removes group regions from every reading on 2026-10-31, so no reading uses this placement.
The region code stays dormant in `crates/archboard-layout/src/blocks` and `track`.
The Rust core, Solver port, worker pool, and vendored Graphviz of ADR 0060 remain.

## Context

Track currently compares an inline drawing with a second drawing that packs each group region as a block.
The core waits for both before it chooses a drawing.
The baseline slow boards ask 24 to 27 solves on their first render.
A card that grows repeats that work.

The first candidate chooses packing at 32 leaf cards and cuts native work by 61.9%.
The size cutoff still has no graph argument that justifies it.

## Decision for the next candidate

Track treats each multi-member group region as one block before it asks for a solve.
A region is the boundary around parts that share a configured group.
The graph's containment and group membership decide the nesting, without a card-count cutoff.
A graph without such a region keeps its inline nesting.
A region with one member keeps the existing compact representation.
Blocks continues to pack containers and group regions.

The core omits the competing whole-board inline solve for a graph with regions.
The core omits partial stacking solves and speculative whole-board solves.
Each architecture graph uses one Solver call.
Dropping its future cancels pending work through the host.
The speculative cancellation token disappears with the competing solves.

The orthogonal router reserves earlier parallel lanes for unrelated source and target pairs.
Every fixed pin reserves its exit before the first path starts.
The path grid adds columns and rows beside the routes already found.
A perpendicular crossing remains available.
The path search first minimizes reused parallel length, then distance, bends, and crossings.
This ordered cost retains a route when the available room forces reuse.
Hard exclusions failed because they made the old fallback cross cards.

The router produces final bend positions and removes the later nudge and segment-order phases of ADR 0059.
No later axis pass can move a shared turn onto another line.

There is one implementation and no old/new switch.

## Consequences

Similar groups follow the same rule regardless of board size or worker timing.
Group membership becomes the layout boundary that limits the size of each Graphviz problem.
The renderer fixes a defect inside Groups rather than steering an affected board away from it.

The former score comparison no longer decides whether groups pack.
Drawing integrity remains mandatory, and the council decides whether changed pictures read as well or better.
The proposal remains unaccepted while the unconditional candidate has defects or lacks a passing council verdict.
The owner still targets first renders and card-growth renders below 500 ms.
