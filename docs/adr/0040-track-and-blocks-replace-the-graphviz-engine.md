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

Track and Blocks are the only layout engines. Track is the default. A render, a
rasterized picture and a browser that names no engine draw with Track. Blocks
stays selectable. The choice of engine sits behind `lib/layout/engines.ts`.
`LayoutEngineSchema` in `src/shared/semantic-board/lib/rendering.ts` names the
two.

The code of the Graphviz engine is deleted. That code is
`lib/layout/compound.ts` and the 33 modules that only it used. Those modules
placed, folded, routed, reserved labels, settled ports and finished the drawing.
Git keeps the code at `c8f2e280`.

These parts stay:

- Graphviz places the cards for both engines, through `lib/track/graphviz.ts`
  and `lib/blocks/graphviz-once.ts`.
- libavoid routes the trunks that Blocks draws between its blocks
  (`lib/blocks/trunks.ts` and its neighbors).
- The engine pool and the two workers load both libraries as before.
  `loadLayoutEngine` still puts back what both held as loaded before every solve
  (one run of a layout engine).

A solve names its engine in the `archboard.stage` option, `track` or `blocks`. A
solve that names neither is refused with an error that names the two. Before,
such a solve placed and routed with the Graphviz engine.

There is no alias for the old name. If somebody states `graphviz`, it is refused
with the engines there are. `archboard semantic render` and `semantic rasterize`
with `--layout graphviz` exit with status 2, and the error lists `track` and
`blocks`. The render route answers `?layout=graphviz` with 400 `BAD_REQUEST` and
says to choose track or blocks.

If only a preference remembers `graphviz`, it falls back to the default quietly.
A browser that remembers `graphviz` in its storage draws with Track. The stored
value stays until the person picks another engine, and the browser always reads
it as Track. Cached pictures drawn with `graphviz` are never looked up again. If
the renderer build changes, they are cleared with the other stale pictures. No
board, vault or server setting stores an engine, so nothing else changes.

ADR 0039's rule, that a drawing is measured by how easily it reads, governs
Track and Blocks as before. Its sentences about what Graphviz counts, its
settlement of routes (`even-pins.ts`), its column fold and
`lib/layout/column-readings.ts` describe code that is now deleted.

## Consequences

- Every Track and Blocks picture of the dogfood vault and of a copy of a work
  vault, 228 drawings in all, is byte-identical before and after the removal.
- The renderer's module tests took about 120 seconds before and about 35 after
  on this machine. The machine was busy both times. Treat the numbers as rough.
- Tests that held a shared rule through the Graphviz engine now hold it over
  Track and Blocks. Tests of the Graphviz engine's own passes were deleted with
  them.
- Two things are lost, and the loss is accepted. One is Graphviz's arrangement
  of groups, which the user named. The other is lines keeping a lane (a passage
  where lines run) from the standing pin that the card of a proposal wears. Only
  the Graphviz engine did this.
- When the tests moved, these gaps in the remaining engines showed up. Each test
  now runs on the engine that keeps the rule, and it says why:
  - Track leaves a container by its side for the container's own dependency
    ahead of it. Blocks leaves by the forward face.
  - Track pads a container whose cards fan out below it wider than its insets.
    Blocks keeps the insets.
  - Blocks runs two of Reading a board's lines part of a lane apart. Track keeps
    them a whole lane apart or on one stroke.
- No Track or Blocks solve of the dogfood boards or the wide-board fixtures
  depends on what was solved before it. The test that proved the memory reset
  with a Graphviz-engine graph was therefore deleted. The reset stays, because
  Blocks still routes with libavoid. The test that libavoid loads into the same
  memory on every host stays.

Superseded in part (2026-10-25, TASK-520.02,
[ADR 0057](0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)):
the router of the renderer core routes the trunks of Blocks, in place of
libavoid. The engine pool and the workers load the core and Graphviz, and
libavoid-js, its patch and the test that it loads into the same memory are
gone.

Superseded in part (2026-10-25, TASK-520.05,
[ADR 0057](0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)):
the renderer core lays out every Track and Blocks solve through one call,
`layOutBoard`, and the `archboard.stage` option is gone. A solve's root
options say how it draws the board's containers and group regions, in
`archboard.blocks.nesting`: `blocks`, `inline` or `groups`, and `inline` when
they say nothing. The core refuses any other value with an error that names
the three. The core asks the host's Graphviz to place the cards, in place of
`lib/track/graphviz.ts` and `lib/blocks/graphviz-once.ts`.
