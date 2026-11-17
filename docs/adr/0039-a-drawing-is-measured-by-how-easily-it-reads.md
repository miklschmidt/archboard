---
status: accepted
---

# A drawing is measured by how easily it reads, and fit is a guideline

Superseded in part by
[ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md): its clauses on
what the Graphviz engine counts, its route settlement (`even-pins.ts`) and its
column fold describe code that no longer exists.

Superseded in part by
[ADR 0043](0043-the-renderer-lays-boards-out-for-a-tuned-page-shape.md): the
reference pane it keeps as the yardstick for fit takes its height from a tuned
page shape of 1.4, not from the desktop shell.

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
buy a crossing. Blocks chooses its placements and joins by fit. Picture reviews counted a
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
- Stacks of unrelated lines drawn on one stroke, and double tracks. A lane is a
  passage where lines run. A double track is two unrelated lines that run closer
  than a lane apart for a long stretch. Lines exactly a lane apart stand at the
  routers' channel pitch and are not a double track.
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

Every chooser that this decision changed makes two picks:
the pick it made before this decision (its earlier weighing), and a reading
pick.

If the two picks agree, that is the choice. If they differ, the reading pick
wins on one condition. It must be no worse than the earlier pick on every number
that the engine counts, with route length within a twentieth. Otherwise the
earlier pick stays. Two drawings often trade one number for another. This guard
stops a crossing saved from buying more bends, more line or a hook.

## Consequences

- A drawing that improved on the comparison alone but traded one number for
  another goes back to the drawing it had before this decision, fit included.
  Those trades are the cost of the rule that no drawing reads worse than it did.

## Amendment of 2026-10-17: a line that runs away from its ends weighs as crossings

TASK-486 wrapped container headers at their drawn width. The new sizes made
some choosers take layouts that a reader sees at once as worse. The measures did not
weigh how far a line travels outside the region between its two ends.

The measure is the run away. For each line, take the smallest box that holds
both of its end cards, and grow it by 24 px on every side. The run away is the
length of the line outside that box. Each whole 300 px that one line runs away
counts as one crossing. 300 px is the rate at which the trunk router already
weighs a detour (`lib/blocks/trunks.ts`). A short turn beside an end costs
nothing.

Runs away are counted with crossings, so the order of the measures does not
change. The second measure is now crossings, crossings on a line's corner and
runs away.

TASK-486 records the drawings that still read worse than before it.
