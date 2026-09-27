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
drawings equal on every earlier one.

- the reader invariants of ADR 0028: no route through a card, no fan of skips
  down a flank, bounded bends per route, every label on a straight run of its
  own route;
- crossings, and crossings on a line's corner;
- stacks of unrelated lines drawn on one stroke, and double tracks (unrelated
  lines running closer than a lane apart for a long stretch; lines exactly a
  lane apart stand at the routers' channel pitch and are not a double track);
- side hooks, ports crowding a card's corner or a badge, lines hugging a frame
  wall;
- labels crowded by other lines, and streaks resting on a label, a hop or a
  junction;
- bends and route length.

Fit and the aspect ratio of the page are a guideline. They break ties between
drawings that read equally well, and a review never counts a smaller fit as a
regression on its own. A drawing that shows at 0.4 is still drawn and
navigable, and panning it costs a reader less than a line they cannot follow.
The reference pane stays the yardstick fit is measured against, and fit stays
on the scorecard as the tie-breaker. Folding a tall board into columns, and
wrapping a wide board's rank into rows, stay: they exist to fit the page, and
the bends and route length they add are their price.

A chooser takes a drawing other than the one it took before this decision
only where that drawing is no worse on any number the engine counts. The next
section says how the engines do this.

### How the engines choose

- **The comparison** (`readingOrder` in `lib/track/score.ts`). Two layouts
  are compared on four numbers, in this order: crossings; hooks; bends; route
  length. The first number on which they differ decides. Two route lengths
  within a twentieth of each other count as equal. When all four are equal,
  the layout that fits the reference pane better wins, and then the smaller
  page. An engine that does not count a number leaves it equal.
- **What each engine counts.** Graphviz counts, on its settled drawing,
  crossings and hooks. Its crossings are every place two lines cross, one
  more for each of those within a lane of a line's bend, and one for each
  stretch of at least a lane on which two unrelated lines share one stroke
  (`crossingsSeen`). Its hooks
  are line ends that hook into a card's side, pairs of lines that touch, and
  joins crowded into one blot. Track and Blocks count crossings, bends and
  route length on their lines as drawn. Where they choose whether a block's
  containers stack, a line that laps round the block past every card it
  holds counts as one crossing more: stacked, One write lands (Track) turned
  its lines less but sent 'announce the accepted write' down the page's
  right edge. No chooser this decision changed counts double tracks, Track
  and Blocks count no hooks, and Graphviz no bends or route length: counting
  them changed no drawing in either vault. Graphviz's settlement of its
  routes (`even-pins.ts`, which this decision did not change) does weigh
  double tracks and lines on one stroke among the defects it refuses.
- **The guard** (`takes`). Every chooser this decision changed makes two
  picks: the pick it made before this decision (its earlier weighing), and a
  reading pick. When the two picks agree, that is the choice. When they
  differ, the reading pick is taken only if it is no worse than the earlier
  pick on every number the engine counts, route length within a twentieth.
  Otherwise the earlier pick stays. Two drawings often trade one number for
  another, and the guard stops a crossing saved from buying more bends, more
  line or a hook.
- **The reading picks.** Whether a block's containers stack, and whether a
  board drawn inline packs its group regions: the comparison. Which way a
  block's joins are kept whole: the way that parts fewer joins, and between
  ways that part as many, the comparison. Graphviz's column fold: the fold
  must fit the reference pane at least a twentieth better than the unfolded
  drawing and read no worse on the comparison. Its earlier weighing is that
  fit gain and a higher score, fit less a share for each crossing. A fold
  with a crossing fewer and two hooks more passes both, so it was taken
  before this decision and still is. A drawing that fits a twentieth better
  shows at about the same scale, which pays for none of a fold's price.
- **Choosers left on their earlier weighing.** Settling a block's ports:
  held to the guard, it drew Public ownership (Blocks) with four more
  crossings and IIS data with one more. The held port order and the board's
  wrap: on every board of both vaults the guard kept their earlier pick, so
  their earlier rule is kept. The wrap of a block inside the board and the
  fold of a block of cards are chosen before the drawing exists, on their fit
  less a share for each crossing, their fit standing for how the finished
  drawing will read. A block of blocks' packing is chosen that way too, and
  is the one change outside the guard: where two packings score alike, the
  smaller page is taken rather than the first packing tried. In Reading a
  board (Blocks) the first packing tried stepped 'one stage per pane' down
  three bends, alongside the dashed 'a board's new version' for 180 px; on
  the smaller page it turns once and hops the dashed line.

## Consequences

- The choosers change as the section above says: Track's and Blocks'
  stacking, joins and packing (`lib/blocks/place.ts`, `joins.ts`), a block
  of blocks' ties (`pack.ts`), and Graphviz's column fold
  (`lib/layout/column-readings.ts`). Each is judged by
  the pictures it gives.
- A drawing that improved on the comparison alone but traded one number for
  another goes back to the drawing it had before this decision, fit included.
  Those trades are the cost of the rule that no drawing reads worse than it
  did.
- Picture reviews list a change of fit as information and judge the drawing by
  how it reads.
