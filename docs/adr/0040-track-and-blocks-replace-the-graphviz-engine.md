---
status: accepted
---

# Track and Blocks replace the Graphviz engine

This decision supersedes
[ADR 0033](0033-graphviz-placement-and-obstacle-routing.md). It also supersedes
the clauses of [ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md)
that describe what the Graphviz engine counts and how it folds a board into
columns. The user decided it on 2026-09-27.

## Context

Three layout engines stood behind one seam, `lib/layout/engines.ts` (TASK-348).
A seam is the one place where code chooses between engines. The `graphviz`
engine was the default. Graphviz placed the cards, and libavoid routed the lines
around them. A long chain of passes then reserved room for labels, settled the
ports, cleared frame walls and standing pins, and finished the drawing. The
engines `track` (TASK-349) and `blocks` (TASK-351) were selectable.

Each round of picture fixes to the Graphviz engine added a pass. Each pass
risked bringing back a defect that another pass cured. The engine was also the
slowest. Its drawing of the Archboard server board in the wide-boards test did
not finish inside the test's 20-second budget. The user decided:

> I think we should deprecate the Graphviz engine instead of spending time
> fixing it. Tracks and Blocks are both more feature complete, faster and one of
> them usually gets pretty close to the old grpahviz arrangement anyway (except
> for the grouping stuff).

## Decision

Track and Blocks are the only layout engines. Track is the default. Blocks
stays selectable.

The code of the Graphviz engine is deleted. Git keeps the code at `c8f2e280`.

These parts stay:

- Graphviz places the cards for both engines.
- libavoid routes the trunks that Blocks draws between its blocks.

There is no alias for the old name. If somebody states `graphviz`, it is refused
with the engines there are.

If only a preference remembers `graphviz`, it falls back to the default quietly.
No board, vault or server setting stores an engine, so nothing else changes.

ADR 0039's rule, that a drawing is measured by how easily it reads, governs
Track and Blocks as before. Its sentences about what Graphviz counts, its
settlement of routes (`even-pins.ts`), its column fold and
`lib/layout/column-readings.ts` describe code that is now deleted.

## Consequences

Two things are lost, and the loss is accepted. One is Graphviz's arrangement of
groups, which the user named. The other is lines keeping a lane (a passage where
lines run) from the standing pin that the card of a proposal wears. Only the
Graphviz engine did this.

Superseded in part (2026-10-25, TASK-520.02,
[ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)):
the router of the renderer core routes the trunks of Blocks, in place of
libavoid.

Superseded in part (2026-10-25, TASK-520.05,
[ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)):
the renderer core lays out every Track and Blocks solve through one call,
`layOutBoard`. The core asks the host's Graphviz to place the cards.

Superseded in part (2026-10-30, TASK-554,
[ADR 0064](0064-blocks-is-the-default-layout-engine.md)):
Blocks is the default for renders, rasterized pictures, walkthroughs, and browsers that name no engine.
An unavailable remembered engine also falls back to Blocks.
