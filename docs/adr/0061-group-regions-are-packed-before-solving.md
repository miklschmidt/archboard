---
status: proposed
---

# Group regions are blocks before solving

TASK-548.08 proposes this change on 2026-10-26.
The parent council judges every changed drawing before this decision is accepted.
It replaces the speculative layout choices in ADR 0059 and their global reading comparison from ADR 0039.
The Rust core, Solver port, worker pool, and vendored Graphviz of ADR 0060 remain.

## Context

Track currently compares an inline drawing with a second drawing that packs each group region as a block.
The core waits for both before it chooses a drawing.
The baseline slow boards ask 24 to 27 solves on their first render.
A card that grows repeats that work.

The first candidate chooses packing at 32 leaf cards and cuts native work by 61.9%.
The council rejects its Browser application drawing because an enclosing container covers nested parent frames.
The layout repair carries inline containment depths into each packed group.
The frame regression and whole-board corpus now catch this defect.
The size cutoff still has no graph argument that justifies it.

An earlier unconditional probe also exposes routing and alignment failures on small graphs.
Those failures remain diagnostic inputs for the next candidate.
A faster layout cannot justify a missing frame, an ambiguous trunk, or a line through a card.

## Decision for the next candidate

Track treats each multi-member group region as one block before it asks for a solve.
A region is the boundary around parts that share a configured group.
The graph's containment and group membership decide the nesting, without a card-count cutoff.
A graph without such a region keeps its inline nesting.
A region with one member keeps the existing compact representation.
Blocks continues to pack containers and group regions.

A packed region retains its inline enclosing parent and its containment depth.
A group-level caller precedes the header of a container that it enters when that ordering closes no cycle.

The core omits the competing whole-board inline solve for a graph with regions.
Every fan-in keeps its labels beside its sources before the shared trunk.
Outgoing ports identify the original source card.
Incoming ports identify the original target card.
A label before a fan-in join also distinguishes its target at the outgoing port.
Relationship kind and direction remain part of each port identity.
The core removes the competing label positions and wall-facing solves.
Every card block keeps the acyclic entry constraints that hold a caller above the container header it enters.
The core omits partial stacking solves and speculative whole-board solves.
Each architecture graph uses one Solver call.
Dropping its future cancels pending work through the host.
The speculative cancellation token disappears with the competing solves.
Wrap candidates remain local to the block inside that solve.

Each card block uses one graph with its existing title ties and leaving-label constraints.
The core removes the competing title and entering-label remedies.
A wrap reuses its ranked geometry for its sink decision and final routing.
Local wraps and port-order candidates remain inside the single solve.

The packer compares measured block sizes and estimated line crossings before routing.
It routes the selected packing once, then adds channel room when distinct routes require it.
The packer reserves a lane for each distinct face port and each first-row arrival.
It includes routed lines in each child's bounds because its parent treats that child as one obstacle.
A route keeps its body inside those bounds, apart from the fixed stub that crosses a face.
The clearance includes a complete bend and arrow approach.

Ports settle after both ends are known.
The parent reads each child’s final port positions after that child reroutes.
A bundle retains only the original source and target common to every relationship it represents.
Coincident boundary ports do not establish that two routes share a card.

The orthogonal router reserves earlier parallel lanes for unrelated source and target pairs.
Every fixed pin reserves its exit before the first path starts.
The path grid adds columns and rows beside the routes already found.
A perpendicular crossing remains available.
The path search first minimizes reused parallel length, then distance, bends, and crossings.
This ordered cost retains a route when the available room forces reuse.
Hard exclusions failed because they made the old fallback cross cards.

The router produces final bend positions and removes the later nudge and segment-order phases of ADR 0059.
No later axis pass can move a shared turn onto another line.
The layout keeps its joined-line simplifier, with painted title bounds from the fitted frames.
The drawing helpers reject missing frames, detached endpoints, header strikes, and ambiguous shared strokes.
The council decides whether the remaining changes improve how the picture reads.

There is one implementation and no old/new switch.
Saved parent binaries, matching core builds, and complete corpora provide the comparison.
Every corpus includes authored views and the complete architecture of every vault board.
A parent frame must remain visible above its enclosing containers, and every line must meet a visible boundary.

## Consequences

Similar groups follow the same rule regardless of board size or worker timing.
Group membership becomes the layout boundary that limits the size of each Graphviz problem.
The renderer fixes a defect inside Groups rather than steering an affected board away from it.

The former score comparison no longer decides whether groups pack.
Drawing integrity remains mandatory, and the council decides whether changed pictures read as well or better.
The proposal remains unaccepted while the unconditional candidate has defects or lacks a passing council verdict.
The owner still targets first renders and card-growth renders below 500 ms.
The design note records measurements after TASK-553, rejected alternatives, and remaining work.

TASK-548.10 applies when this work changes routing or bundling.
A shared trunk must preserve which source reaches which target.
