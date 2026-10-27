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
A graph without such a region keeps its inline nesting, apart from the local parent rule below.
A region with one member keeps the existing compact representation.
Blocks continues to pack containers and group regions.
A named parent interface packs disconnected member sets as separate units beside its nested frames and regions.
Direct member relationships define those sets, regardless of direction.
A connected set retains its shared ranks.
The board and unnamed scopes retain their shared collaborator context.

A packed region retains its inline enclosing parent and its containment depth.
A parent uses local ranks when a path between different member cards leaves that parent and returns through outside cards.
The rule reads containment and relationships before the solve.
Paths through parent interface names do not stand for paths through their members.
The parent keeps the existing block layout and ports.
Parents also use local ranks for three more graph shapes when no relationship names their interface.
Those shapes are a flat sink, a nested transparent wrapper, and work with one exclusive outside collaborator.
A caller context is one parent and its members.
A flat sink receives every outside call from one caller context and has no outgoing dependency beyond its parent.
Its members contain no nested parents.
It contains an internal relationship.
An isolated scope or loose caller does not establish that shared context.
A nested wrapper uses local ranks when its one descendant sends work outside it.
An exclusive collaborator is a leaf with one incoming relationship and no outgoing work.
Its caller has exactly one relationship that leaves that parent.
Other parents remain inline.
This prevents an outside path from stretching a frame between distant member ranks.
A closed collection of transparent parent frames also uses local ranks when its one outside root caller sends one relationship and receives none.
Each nested parent contains one leaf card, and every leaf belongs to a nested parent.
Complex scopes retain their existing entry ordering.
The hierarchy contains internal work and has no outgoing dependency.
Every parent inside that hierarchy becomes a local unit.
This keeps an outside caller's label above the hierarchy instead of below its full height.

Both engines pack a holder of complete parent frames when it has no inline clusters or labelled trunks.
Track's organizational regions retain their shared rank context.
Blocks retains its existing region packing.
For that all-frame shape, measured packing replaces the Graphviz ranks described in ADR 0060.
This also removes an unnecessary fold into columns and its full-height buses.
The facing pass can read the child boxes directly.
Labelled exits can use the facing wall, through the existing wall stubs and label ranks.
The obsolete restriction that holds every labelled exit on its bottom face is removed.
The existing entry-ordering constraints stay unchanged.

Track places a parent beside its exclusive loose collaborator in one measured row.
Each side must have exactly one eligible partner.
The original caller must have no other forward relationship in their containing block.
The existing cycle analysis identifies feedback relationships before this decision.
The collaborator and its label reserve one measured box, beside the actual caller's internal port.
The painter keeps the normal card width.
The shared routing pass reserves both the card and the label as obstacles.
The final connection is a short horizontal route at that port's height.

The core omits the competing whole-board inline solve for a graph with regions.
Every fan-in keeps its labels beside its sources before the shared trunk.
Outgoing ports identify the original source card.
Incoming ports identify the original target card.
In Blocks, a same-source fork can share an incoming port when its branch labels remain beyond that boundary.
All of that source's traffic into the parent must share its relationship treatment, direction, and label ownership.
Its destinations can call each other within that local entry work.
A destination called by other member work keeps its own incoming port.
Different relationship treatments keep separate ports.
Direct parent-header entries and fixed side-wall ports keep their existing identities.
Other incoming relationships retain their target joins.
Inline Track ranks retain their target-based entries.
A packed header and its settled top ports keep the trunk router's full clearance.
A label before a fan-in join also distinguishes its target at the outgoing port.
Relationship kind and direction remain part of each port identity.
The core removes the competing label positions and wall-facing solves.
The layout removes the entry constraints that put every caller above an entered header.
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
It estimates each connection from its boundary pins.
It routes the selected packing once, then adds channel room when distinct routes require it.
Each facing gutter reserves room for its maximum concurrent runs.
Separated runs reuse that room at different heights.
The count includes complete runs beyond the facing boxes because they can share turns around the corners.
Each run also reserves a bend and straight approach beyond both ends.
Each relationship keeps its lane reservation, including branches that share part of a route.
The packer reserves a lane for each distinct face port and each first-row arrival.
It includes routed lines in each child's bounds because its parent treats that child as one obstacle.
A route keeps its body inside those bounds, apart from the fixed stub that crosses a face.
The clearance includes a complete bend and arrow approach.

Ports settle after both ends are known.
The parent reads each child's final port positions after that child reroutes.
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
A parent header reserves its entire painted face, including blank space beside its words.
An arrow to that parent meets its header card rather than the surrounding frame.
ADR 0062 gives that header normal card sizing.
Traffic to descendants can pass through the free top edge beside it.
A relationship naming a packed parent reaches its header through the parent's own routed layout.
The layout removes the extra ancestor margins once reserved for full-width header bypass lanes.
Known obstacle edges remain routing candidates regardless of their distance from the initial lane.
Physical clearance takes precedence over fewer crossings when the initial lane crosses an obstacle.
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
