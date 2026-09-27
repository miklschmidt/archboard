---
status: accepted
---

# A drawing is measured by how easily it reads; fit is a guideline

Supersedes the section "Fit in the reference pane is the measure" of
[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md),
and the clause of
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md) that
repeats it. Decided by the user on 2026-09-27.

ADR 0028 made fit in the reference pane the measure of a layout change, with the
reader invariants beside it. Fit is the scale at which the whole drawing shows
in the pane. The scorecard in CONTEXT.md then gave fit the same weight as
crossings and bends. The engines followed. Track's score multiplies fit into the
cost of its crossings, so a better fit can buy a crossing. Blocks chooses its
placements and joins by fit. Graphviz folds a tall board into columns when the
fold fits better. Picture reviews counted a smaller fit as a regression. On
2026-09-27 a review called Board rasterizer worse because it fit 6% smaller,
although the same change removed 704 px of unrelated lines drawn on top of each
other. The user answered that ease of parsing matters much more than screen fit
or the aspect ratio of the diagram, which is a kind of arbitrary goal.

## Decision

A drawing is measured first by how easily a reader follows it. These measures
decide, compared in this order: a drawing better on an earlier measure reads
better, whatever the later ones say, and a later measure decides only between
drawings equal on every earlier one. One line's crossing on a corner, or
hidden in a stack, counts as more than one clean crossing.

- the reader invariants of ADR 0028: no route through a card, no fan of skips
  down a flank, bounded bends per route, every label on a straight run of its
  own route;
- crossings, and crossings on a line's corner;
- stacks of unrelated lines drawn on one stroke, and double tracks (unrelated
  lines running a lane or less apart for a long stretch);
- side hooks, ports crowding a card's corner or a badge, lines hugging a frame
  wall;
- labels crowded by other lines, and streaks resting on a label, a hop or a
  junction;
- bends and route length.

Fit and the aspect ratio of the page are a guideline. They break ties between
drawings that read equally well. A chooser never trades a crossing, a stack, a
hook or a crowded label for a better fit, and a review never counts a smaller
fit as a regression on its own. A drawing that shows at 0.4 is still drawn and
navigable, and panning it costs a reader less than a line they cannot follow.

The reference pane stays the yardstick fit is measured against, and fit stays
on the scorecard as the tie-breaker. Folding a tall board into columns, and
wrapping a wide board's rank into rows, stay. They exist to fit the page, and
the bends and route length they add are their price, so a fold or a wrap is
weighed on every other measure and on fit: it is kept only where it has no
more crossings, stacks, double tracks, hooks or touching lines than the
drawing it replaces, and fits the reference pane materially better. For
Graphviz's column fold that is a twentieth; for a board's wrap, a tenth, or a
twentieth where it also cures a defect. A drawing that fits a twentieth better
shows at about the same scale, which pays for none of the fold's price.

## Consequences

- The choosers that rank by fit ahead of the reading measures change: Track's
  score (`lib/track/score.ts`), Blocks' placement, packing and joins
  (`lib/blocks/place.ts`, `pack.ts`, `joins.ts`), and Graphviz's column fold
  (`lib/layout/fold-columns.ts`). Each is judged by the pictures it gives.
- By those pictures, two whole drawings often trade one measure for another,
  and the ordered comparison alone then takes a drawing that reads worse
  somewhere than the one taken before. So the block engine's joins and its
  packing of a board's groups also weigh their two drawings as they did
  before, and take the ordered comparison's pick only where the two agree or
  where it reads no worse on any measure; otherwise the earlier pick stands,
  fit included. Settling a block's ports keeps its earlier score (fit less a
  share per crossing) outright: on the ordered comparison it ran a line along
  a frame's wall, and held to the earlier pick it led the joins to a crossing.
  These are the exceptions to the rule that a chooser never trades a crossing
  for fit, kept because no drawing may read worse than it did.
- Picture reviews list a change of fit as information and judge the drawing by
  how it reads.
