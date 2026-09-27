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
decide:

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
on the scorecard as the tie-breaker. Folding a tall board into columns stays,
and a fold is kept only where the folded drawing reads no worse than the
unfolded one.

## Consequences

- The choosers that rank by fit ahead of the reading measures change: Track's
  score (`lib/track/score.ts`), Blocks' placement, packing and joins
  (`lib/blocks/place.ts`, `pack.ts`, `joins.ts`), and Graphviz's column fold
  (`lib/layout/fold-columns.ts`). Each is judged by the pictures it gives.
- Picture reviews list a change of fit as information and judge the drawing by
  how it reads.
