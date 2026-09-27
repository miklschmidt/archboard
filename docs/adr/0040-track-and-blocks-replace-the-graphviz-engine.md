---
status: accepted
---

# Track and Blocks replace the Graphviz engine

Supersedes [ADR 0033](0033-graphviz-placement-and-obstacle-routing.md), and the
clauses of [ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md)
that describe what the Graphviz engine counts and how it folds a board into
columns. Decided by the user on 2026-09-27.

## Context

Three layout engines stood behind one seam, `lib/layout/engines.ts`
(TASK-348). The `graphviz` engine was the default. Graphviz placed the cards,
libavoid routed the lines around them, and a long chain of passes then
reserved room for labels, settled the ports, cleared frame walls and standing
pins, and finished the drawing. `track` (TASK-349) and `blocks` (TASK-351) were
selectable.

Each round of picture fixes to the Graphviz engine added a pass, and each pass
could bring back a defect another pass had cured. The engine was also the
slowest: its drawing of the Archboard server board in the wide-boards test did
not finish inside the test's 20-second budget. The user decided:

> I think we should deprecate the Graphviz engine instead of spending time
> fixing it. Tracks and Blocks are both more feature complete, faster and one
> of them usually gets pretty close to the old grpahviz arrangement anyway
> (except for the grouping stuff).

## Decision

Track and Blocks are the only layout engines. Track is the default: a render,
a rasterized picture and a browser that names no engine draw with Track. Blocks
stays selectable. The engine is chosen behind `lib/layout/engines.ts`, and
`LayoutEngineSchema` in `src/shared/semantic-board/lib/rendering.ts` names the
two.

The Graphviz engine's code is deleted: `lib/layout/compound.ts` and the 33
modules only it used, which placed, folded, routed, reserved labels, settled
ports and finished the drawing. Git keeps it at `c8f2e280`.

What stays:

- **Graphviz** places the cards for both engines, through `lib/track/graphviz.ts`
  and `lib/blocks/graphviz-once.ts`.
- **libavoid** routes the trunks Blocks draws between its blocks
  (`lib/blocks/trunks.ts` and its neighbours).
- **The engine pool and the two workers** load both libraries as before, and
  `loadLayoutEngine` still puts back what both held as loaded before every
  solve.

A solve names its engine in the `archboard.stage` option, `track` or `blocks`.
A solve that names neither is refused with an error that names the two. Before,
such a solve placed and routed with the Graphviz engine.

There is no alias for the old name. Where somebody states `graphviz`, it is
refused with the engines there are:

- `archboard semantic render` and `semantic rasterize` with `--layout graphviz`
  exit with status 2, and the error lists `track` and `blocks`.
- The render route answers `?layout=graphviz` with 400 `BAD_REQUEST` and says to
  choose track or blocks.

Where only a preference remembers it, it falls back to the default quietly:

- A browser that remembers `graphviz` in its storage draws with Track. The
  stored value stays until the person picks another engine, and is always read
  as Track.
- Cached pictures drawn with `graphviz` are never looked up again, and are
  cleared with the other stale pictures when the renderer build changes.

No board, vault or server setting stores an engine, so nothing else changes.

## What ADR 0039 still says

ADR 0039's rule, that a drawing is measured by how easily it reads, governs
Track and Blocks as before. Its sentences about what Graphviz counts, its
settlement of routes (`even-pins.ts`), its column fold and
`lib/layout/column-readings.ts` describe code that is now deleted.

## Consequences

- Every Track and Blocks picture of the dogfood vault and of a copy of a work
  vault, 228 drawings in all, is byte-identical before and after the removal.
- The renderer's module tests took about 120 seconds before and about 35 after
  on this machine, which was busy both times. Treat the numbers as rough.
- Tests that held a shared rule through the Graphviz engine now hold it over
  Track and Blocks. Tests of the Graphviz engine's own passes were deleted with
  them.
- These are lost, and are accepted:
  - Graphviz's arrangement of groups, which the user named.
  - Lines keeping a lane from the standing pin a proposal's card wears. Only
    the Graphviz engine did this.
- These gaps in the remaining engines showed up when the tests moved. Each test
  now runs on the engine that keeps the rule, and says why:
  - Track leaves a container by its side for the container's own dependency
    ahead of it. Blocks leaves by the forward face.
  - Track pads a container whose cards fan out below it wider than its insets.
    Blocks keeps the insets.
  - Blocks runs two of Reading a board's lines part of a lane apart. Track
    keeps them a whole lane apart or on one stroke.
- No Track or Blocks solve of the dogfood boards or the wide-board fixtures
  depends on what was solved before it, so the test that proved the memory reset
  with a Graphviz-engine graph was deleted. The reset stays, since Blocks still
  routes with libavoid. The test that libavoid loads into the same memory on
  every host stays.
