---
status: proposed
---

# Group regions are blocks before solving

TASK-548.08 proposes this change on 2026-10-26.
The parent council judges every changed drawing before this decision is accepted.
It replaces the group-packing competition in ADR 0059 and its global reading comparison from ADR 0039.
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

The core omits the competing whole-board inline solve for a graph with regions.
It applies one graph predicate to every block to detect whether stacking can change anything.
If no ranked line enters one inline container from another, it asks one layout solve.
The remaining joins, stacking, and wrap choices keep their Solver contract while the task replaces more speculative work.

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
