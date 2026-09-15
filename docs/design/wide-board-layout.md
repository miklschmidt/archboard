# Wide boards: where the space goes

A board of about fifteen cards and thirty labelled relationships comes out of
the compound renderer with the cards on a small fraction of a very wide page,
long parallel corridors along the margins, and labels far from either endpoint.
The grader of the 2026-09-15 skill-evaluation batch scored the three candidate
S14 boards (Flask 3.0.0 mapped at the system level) 5.3 to 6 on readability
while finding every endpoint on its card and every label legible: the loss is
in distribution and routing, not in any one defect. This note attributes it to
layout stages by measurement, so that each stage can be changed and measured on
its own. Nothing in the renderer changed for this note.

## Fixture and measurements

The three boards are kept as `wide-board-layout-fixtures/flask-map-{1,2,3}.content.json`
(15 nodes each; 25, 31 and 29 edges), and `measure.ts` beside them renders each
and prints, per board: the page size; the number of card rows; the share of the
page under cards and the share of 100 px cells that touch a card; how many
relationships leave their source by its west face and the most from one card;
the share of route ink in margin corridors (vertical runs outside every card's
x-range); and the distance from each label to the nearer of its endpoints.
Run it from the repository root with a mode: `baseline`, `layering`
(`elk.layered.layering.strategy=NETWORK_SIMPLEX`), `compaction`
(`elk.layered.compaction.postCompaction.strategy=EDGE_LENGTH` with
`elk.layered.nodePlacement.strategy=NETWORK_SIMPLEX`) or `both`. The `skips`
rows below came from the same script with `sidesOf` in `compound-graph.ts`
temporarily returning `["SOUTH", "NORTH"]` for every forward skip; that change
is not in the tree.

| mode                          | board | page (Mpx) | rows | cards % | cells % | west exits (max/card) | corridor ink | bends per edge | label gap median / max / over 200 px |
| ----------------------------- | ----- | ---------: | ---: | ------: | ------: | --------------------: | -----------: | -------------: | -----------------------------------: |
| baseline                      | 1     |       6.40 |    9 |     7.5 |      18 |             11/25 (5) |          23% |            7.4 |                233 / 1345 / 15 of 25 |
| baseline                      | 2     |       6.15 |    9 |     8.5 |      21 |             12/31 (3) |          27% |            7.1 |                252 / 1339 / 18 of 31 |
| baseline                      | 3     |       7.52 |    8 |     6.5 |      15 |             13/29 (6) |          23% |            8.6 |                223 / 1413 / 18 of 29 |
| layering                      | 1     |       5.32 |    7 |     9.0 |      20 |             11/25 (5) |          22% |            7.0 |                218 / 1380 / 14 of 25 |
| layering                      | 2     |       5.27 |    8 |     9.9 |      23 |             12/31 (3) |          25% |            6.8 |                 150 / 723 / 15 of 31 |
| layering                      | 3     |       6.18 |    7 |     7.9 |      19 |             13/29 (6) |          20% |            9.2 |                306 / 1222 / 20 of 29 |
| compaction                    | 1     |       5.76 |   13 |     8.3 |      23 |             11/25 (5) |          20% |            7.0 |                149 / 1754 / 10 of 25 |
| compaction                    | 2     |       5.14 |   12 |    10.2 |      23 |             12/31 (3) |          26% |            6.8 |                 131 / 989 / 14 of 31 |
| compaction                    | 3     |       5.96 |   14 |     8.2 |      21 |             13/29 (6) |          17% |            8.9 |                225 / 2319 / 17 of 29 |
| skips                         | 1     |       4.93 |    8 |     9.7 |      24 |              0/25 (0) |           0% |            5.8 |                 221 / 792 / 15 of 25 |
| skips                         | 2     |       6.22 |    8 |     8.4 |      20 |              0/31 (0) |           2% |            5.7 |                193 / 1045 / 15 of 31 |
| skips                         | 3     |       7.63 |    8 |     6.4 |      16 |              0/29 (0) |           1% |            9.1 |                387 / 1370 / 21 of 29 |
| skips + layering + compaction | 1     |       3.98 |   14 |    12.0 |      29 |              0/25 (0) |           0% |            5.3 |                  172 / 749 / 8 of 25 |
| skips + layering + compaction | 2     |       5.57 |   12 |     9.4 |      21 |              0/31 (0) |          19% |            7.0 |                 117 / 643 / 10 of 31 |
| skips + layering + compaction | 3     |       4.73 |   13 |    10.3 |      29 |              0/29 (0) |           1% |            8.6 |                 230 / 616 / 16 of 29 |

"Rows" counts distinct card tops at 20 px resolution; post-compaction moves
cards off their layer line, which is why that count rises under it. "Bends"
counts every change of axis along a route, crossing hops included, since a
reader follows each one; a route that gains corners to save a corridor is a
snake, and the numbers say so. The baseline rows were measured after the
label pass learned to tolerate the engine's half-unit route snapping (the
2026-09-15 fix that stopped a badge from forcing a label reservation and a
layer of its own); boards 2 and 3 changed slightly with it.

## What each symptom is

**The margin corridors and the six edges leaving one card** (board 3, WSGI
application) are the skip rule in `compound-graph.ts`: a forward relationship
that spans more than one rank leaves the source's west face and enters the
target's west face, so every skip from a hub gets its own lane down the left
margin and a horizontal approach along the target's row. A hub with six skips
is six lanes. Between 23% and 27% of the route ink is in such corridors, and the
approach along the row is what a label ends up on, far from both ends. Routing
skips as descents (bottom face to top face, which the engine routes between
rows) removes the corridors on all three boards (0% to 2%) and cuts the page of
board 1 by 23% while leaving boards 2 and 3 within 2% of their size, because the
engine then needs room between rows for the long edges. The west flank is right
for a skip in one column (the bracket beside a chain, which
`tests/skipped-connections.test.ts` holds), and wrong for a skip to another
column, where it manufactures a corridor; that distinction is the change to
make, not a blanket switch.

**The detached column of cards and the empty regions** (board 1's six cards at
the far left, board 2's empty upper right and middle left) are layering and
placement. `LONGEST_PATH_SOURCE` layering gives nine rows to fifteen cards, so
most rows hold one or two cards, and the engine's node placement then spreads
those few cards across the full width the corridors demand; cards cover 6% to
9% of the page and only 15% to 21% of 100 px cells touch one. Network-simplex
layering alone takes the rows to seven or eight and the page down by 14% to 18%;
post-compaction alone changes little (the corridors still set the width); the
three changes together reach 29% of cells touched on boards 1 and 3 and a page
38% and 37% smaller than baseline, and board 2 only 9% smaller because its
corridors return (19%) once the long edges are routed between rows there. The
stages interact, so a follow-up must be measured with the others in place.

**Labels far from their endpoints** are the label pass in `label-runs.ts`,
which chooses the longest clear run of a route. On a skip that run is the
corridor or the row approach, hundreds of pixels from either card; the median
distance is 223 px to 252 px at baseline and more than half of the labels sit
over 200 px away. Shorter routes help (the combined mode halves the count over
200 px on board 1) but do not fix it: a label belongs on the run nearest an
endpoint that can hold it, and that preference is not in the pass.

## Follow-ups

Each stage has its own task with its acceptance stated as measurements on these
three fixtures, run together because the numbers move each other: skip routing
by column (TASK-231), label placement nearest an endpoint (TASK-232), and
layering with compaction for card distribution (TASK-233). The numbers are a
floor, not the verdict: each task also rasterizes the three boards before and
after (`PICTURES=1`) for a person to read side by side, and holds bends per
edge within 10% of baseline, because a page that measures smaller and reads
worse, or saves a corridor by snaking, has not improved anything.
