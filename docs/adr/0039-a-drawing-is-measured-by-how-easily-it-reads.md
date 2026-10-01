---
status: accepted
---

# A drawing is measured by how easily it reads, and fit is a guideline

Superseded in part by
[ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md): its clauses on
what the Graphviz engine counts, its route settlement (`even-pins.ts`) and its
column fold describe code that no longer exists.

This decision supersedes the section "Fit in the reference pane is the measure"
of
[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md),
and the clause of
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md) that
repeats it. The user decided this on 2026-09-27.

ADR 0028 made fit in the reference pane the measure of a layout change, with the
reader invariants beside it. Fit is the scale at which the whole drawing shows
in the pane. The scorecard in CONTEXT.md then gave fit the same weight as
crossings and bends. The engines followed.

Track's score multiplies fit into the cost of its crossings, so a better fit can
buy a crossing. Blocks chooses its placements and joins by fit. If the fold fits
better, Graphviz folds a tall board into columns. Picture reviews counted a
smaller fit as a regression.

On 2026-09-27 a review called Board rasterizer worse because it fit 6% smaller.
The same change removed 704 px of unrelated lines drawn on top of each other.
The user answered that ease of parsing matters much more than screen fit or the
aspect ratio of the diagram. The user called this a kind of arbitrary goal.

## Decision

A drawing is measured first by how easily a reader follows it. These measures
decide, and they compare in this order. A drawing that is better on an earlier
measure reads better, whatever the later measures say. A later measure decides
only between drawings that are equal on every earlier one.

The measures, in order:

- The reader invariants of ADR 0028: no route through a card, no fan of skips
  down a flank, bounded bends per route, and every label on a straight run of
  its own route.
- Crossings, and crossings on a line's corner.
- Stacks of unrelated lines drawn on one stroke, and double tracks. A double
  track is two unrelated lines that run closer than a lane apart for a long
  stretch. Lines exactly a lane apart stand at the routers' channel pitch and
  are not a double track.
- Side hooks, ports crowding a card's corner or a badge, and lines hugging a
  frame wall.
- Labels crowded by other lines, and streaks resting on a label, a hop or a
  junction.
- Bends and route length.

Fit and the aspect ratio of the page are a guideline. They break ties between
drawings that read equally well. A review never counts a smaller fit as a
regression on its own.

A drawing that shows at 0.4 is still drawn and navigable. Panning it costs a
reader less than a line they cannot follow. The reference pane stays the
yardstick that fit is measured against. Fit stays on the scorecard as the
tie-breaker.

Folding a tall board into columns, and wrapping a wide board's rank into rows,
stay. They exist to fit the page. The bends and route length that they add are
their price.

A chooser can leave the drawing that it took before this decision. It does so
only where the other drawing is no worse on any number that the engine counts.
The next section says how the engines do this.

### How the engines choose

The comparison is `readingOrder` in `lib/track/score.ts`. It compares two
layouts on four numbers, in this order: crossings, hooks, bends, route length.
The first number on which they differ decides. Two route lengths within a
twentieth of each other count as equal. If all four numbers are equal, the
layout that fits the reference pane better wins, and then the smaller page. An
engine that does not count a number leaves it equal.

Graphviz counts crossings and hooks on its settled drawing. Each place where two
lines cross is a crossing. A crossing within a lane of a line's bend counts one
more. Each stretch of at least a lane on which two unrelated lines share one
stroke also counts one (`crossingsSeen`). Its hooks are line ends that hook into
a card's side, pairs of lines that touch, and joins crowded into one blot.

Track and Blocks count crossings, bends and route length on their lines as
drawn. Where they choose whether a block's containers stack, a line that laps
round the block past every card it holds counts as one crossing more. In its
stacked form, One write lands (Track) turned its lines less but sent 'announce
the accepted write' down the page's right edge.

No chooser that this decision changed counts double tracks. Track and Blocks
count no hooks. Graphviz counts no bends or route length. Counting them changed
no drawing in either vault. Graphviz's settlement of its routes (`even-pins.ts`)
weighs double tracks and lines on one stroke among the defects that it refuses.
This decision did not change it.

The guard is `takes`. Every chooser that this decision changed makes two picks:
the pick it made before this decision (its earlier weighing), and a reading
pick.

If the two picks agree, that is the choice. If they differ, the reading pick
wins on one condition. It must be no worse than the earlier pick on every number
that the engine counts, with route length within a twentieth. Otherwise the
earlier pick stays. Two drawings often trade one number for another. The guard
stops a crossing saved from buying more bends, more line or a hook.

The reading picks are:

- Whether a block's containers stack, and whether a board drawn inline packs its
  group regions: the comparison.
- Which way a block's joins are kept whole: the way that parts fewer joins.
  Between ways that part as many, the comparison.
- Graphviz's column fold: the fold must fit the reference pane at least a
  twentieth better than the unfolded drawing and read no worse on the
  comparison.

The earlier weighing of the column fold is that fit gain and a higher score. The
score is fit less a share for each crossing. A fold with a crossing fewer and
two hooks more passes both, so it was taken before this decision and still is. A
drawing that fits a twentieth better shows at about the same scale, which pays
for none of a fold's price.

These choosers stay on their earlier weighing:

- Settling a block's ports. Held to the guard, the chooser drew Public ownership
  (Blocks) with four more crossings and IIS data with one more.
- The held port order and the board's wrap. On every board of both vaults, the
  guard kept their earlier pick, so their earlier rule is kept.
- The wrap of a block inside the board and the fold of a block of cards. They
  are chosen before the drawing exists, on their fit less a share for each
  crossing. Their fit stands for how the finished drawing will read.
- A block of blocks' packing. It is chosen that way too, and it is the one
  change outside the guard. Where two packings score alike, the chooser takes
  the smaller page rather than the first packing tried. In Reading a board
  (Blocks), the first packing tried stepped 'one stage per pane' down three
  bends. It ran alongside the dashed 'a board's new version' for 180 px. On the
  smaller page it turns once and hops the dashed line.

## Consequences

- The choosers change as the section above says. They are Track's and Blocks'
  stacking, joins and packing (`lib/blocks/place.ts`, `joins.ts`), a block of
  blocks' ties (`pack.ts`), and Graphviz's column fold
  (`lib/layout/column-readings.ts`). Each is judged by the pictures it gives.
- A drawing that improved on the comparison alone but traded one number for
  another goes back to the drawing it had before this decision, fit included.
  Those trades are the cost of the rule that no drawing reads worse than it did.
- Picture reviews list a change of fit as information and judge the drawing by
  how it reads.
