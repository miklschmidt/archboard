# The architecture layout rules, mapped

What the compound renderer decides itself, what it leaves to ELK, and where
the two disagree. Written on 2026-09-15 after TASK-231 (route a forward skip
to another column as a descent) could not be finished by adding a rule, and
measured on the three Flask module maps of
[wide-board-layout.md](wide-board-layout.md) with `measure.ts`. Rule numbers
below are the inventory's; file references are the current tree.

## 1. The pipeline, and who decides what

| Stage                               | Decided by | Where                                                                                                       |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| Text and card sizes                 | us         | `lib/measurement.ts` (Pretext)                                                                              |
| Dependency ranks, cycle breaking    | us         | `lib/layout/rank.ts`                                                                                        |
| Containment hierarchy, frame insets | us         | `lib/layout/compound-graph.ts` (`containNodes`, `nodeOf`)                                                   |
| Attachment faces and port order     | **us**     | `compound-graph.ts` (`facesOf`, `sidesOf`, `containmentOf`, `previousSides`, `hasTopApproach`, `portOf`)    |
| Boundary crossings as sections      | us         | `compound-graph.ts` (`boundariesOf`, `boundaryPorts`, `edgeOf`)                                             |
| Layers, columns, routes             | ELK        | `COMPOUND_OPTIONS`; `compound.ts` (`solveGraph`)                                                            |
| Card placement across variants      | us → ELK   | `compound-predecessor.ts` (seeds, interactive strategies), `compound-node-hints.ts`, `compound-flanks.ts`   |
| Label placement                     | us         | `lib/layout/label-runs.ts` (ELK sees a label only when a retry reserved it)                                 |
| Corner rounding, bridges            | us         | `lib/layout/curves.ts`, `lib/layout/crossings.ts` (bridging runs in the painter, `lib/svg/architecture.ts`) |

The one row in bold is where the trouble sits. Faces are chosen from ranks
before ELK has placed anything, and ELK is then made to honour them
(`FIXED_ORDER`, escalating to `FIXED_POS` under a predecessor). Every rule
below that reads geometry (`hasTopApproach`, `previousSides`, the reseating in
`compound-flanks.ts`, the lane and badge logic in `compound-node-hints.ts`)
exists to repair that early decision, and every one of them only runs when a
predecessor drawing happens to exist.

## 2. The rule inventory

### A. Semantic ordering (`rank.ts`)

1. An edge is forward only between two nodes of this view, never a self loop.
2. Cycles are broken by a depth-first walk from every node **in document
   order**; the back edge is dropped from ranking, still drawn, and runs back
   up the page.
3. Rank is the longest path from a source, memoized.
4. No authored rank hint exists, on purpose (ADR 0023).

Pinned indirectly (chains read down the page, returns travel right). Cycle
breaking itself has no test.

### B. Faces and ports (`compound-graph.ts`)

5. Precedence: inherited faces from the predecessor, then containment, then
   rank (`facesOf`).
6. Containment: frame → part leaves the frame's top; part → frame lands on the
   frame's bottom (`containmentOf`).
7. Rank (`sidesOf`), with `distance = rank(to) − rank(from)`:
   `≤ 0` return → `EAST, EAST`; different parents → `WEST, WEST`; `1` →
   `SOUTH, NORTH`; `> 1` skip → `WEST, WEST`, or `WEST, NORTH` when the
   predecessor drawing shows the target left of the source (`hasTopApproach`).
8. Every endpoint is its own zero-size port; `elk.port.index` is the other
   end's rank, negated on the east face so returns nest (`portOf`).
9. A crossed frame gets one explicit boundary port on the source's face, and
   the edge becomes one ELK edge per section (`edgeOf`), which is why
   `mergeHierarchyEdges` is off.
10. Inherited faces are recovered from the predecessor curve's ends by nearest
    face; ties fall to the array order WEST, EAST, NORTH, SOUTH
    (`previousSides`, untested).

Pinned by `route-nesting`, `containment-calls`, `skipped-connections`,
`architecture` (frames as endpoints), `compound-layout`.

### C. What ELK is told (`COMPOUND_OPTIONS`, `solveGraph`)

Set: `layered`, `DOWN`, `ORTHOGONAL`, `INCLUDE_CHILDREN`, `DEPTH_FIRST` cycle
breaking, `LONGEST_PATH_SOURCE` layering, `mergeEdges: false`,
`mergeHierarchyEdges: false`, all spacings (node 72, component 96, edge-node
24, edge-edge 20, label-node 24, label-label 24, edge-label 12, port-port 24,
between layers 24/20/20), `edgeLabels.inline: true`,
`centerLabelPlacementStrategy: TAIL_LAYER`, root padding 24, seed 1.

Left at default: node placement (`BRANDES_KOEPF`), post-compaction (`NONE`),
port constraints on leaves (`FIXED_ORDER` is set; `FREE` never used), model
order (`NONE`), layer constraints (none), crossing minimisation
(`LAYER_SWEEP`, thoroughness 7), wrapping (`OFF`), aspect ratio (unset),
high-degree node treatment (off), splines (unused).

11. When any label is measured, `solveGraph` raises all three between-layer
    spacings to fit the **tallest label on the page**: one long label loosens
    every layer. Measured on 2026-09-15 (TASK-240): scoping that room to the
    labels ELK itself places starves the run pass, every label then has to be
    reserved one re-solve at a time, and the pages grow by a third to a
    half (7.06 / 8.32 / 8.58 Mpx). The room is what gives the runs their
    length; it stays, and it is per layer because the engine's spacing model
    is.
12. `TAIL_LAYER` and `inline` apply only to the labels a retry reserved
    (`graphForLabels` strips the rest), which is how a reserved label lands
    inline on its own edge rather than beside it; they are not dead.

### D. After ELK (`compound.ts`, `label-runs.ts`, `curves.ts`, `crossings.ts`)

13. Sections are rejoined per semantic id and simplified; a missing route or
    box throws rather than defaulting.
14. Labels: candidate runs are the edge's own straight segments; a run must
    leave 24 at both ends and clear cards (24), other labels (24) and other
    routes (12); edges are placed in id order; candidates sort by distance to
    the inherited point, then **longest run**, then earliest segment; nothing
    may grow the page; a label with no run forces a reserved ELK re-solve.
15. Corners round to at most 14, less beside a crossing, with 12 straight
    before the first and after the last turn; self loops are a fixed square.
16. Bridges: later-painted route rises at a proper perpendicular crossing,
    groups within 20 share a crest, and a bridge is refused near any ink,
    card, label or corner. This runs in the painter, so `layoutCompound`'s
    curves are not the painted ones.

### E. Continuity across variants (`compound-predecessor.ts` and friends)

17. Sizes never shrink against the predecessor; an unchanged proposal reuses
    the predecessor geometry without solving.
18. Otherwise the predecessor becomes ELK input: every strategy `INTERACTIVE`,
    cards pinned by `elk.position`, ports by offset (escalating to
    `FIXED_POS`), routes seeded, labels seeded between their attachments.
19. New cards: nearest stable anchor by BFS in id order, a layer interpolated
    between anchors, a lane one node-spacing right of the anchor, the smallest
    rightward shift clearing occupied intervals and badge intervals.
20. Same-flank edges get vertical lanes outside both attachments, a second one
    pushed out by the sum of half-widths; flank labels move outward until they
    clear every crossing guide.
21. A `WEST → WEST` skip whose row approach would pass through a card is
    reseated as a descent (`compound-flanks.ts`).
22. Retained routes are seeded before new ones.

Pinned by `predecessor-layout`, `predecessor-routing`, `new-card-placement`,
`comparison-labels`, `comparison-approach`, `standing`.

## 3. What the measurements say

All numbers from `measure.ts` on the three fixtures (boards 1/2/3), page in
Mpx, corridor = share of route ink in vertical runs beside no card, bends per
edge, label gap = median distance from a label to its nearer endpoint.

| Variant                                        | Page               | West exits (max per card) | Corridor  | Bends            | Label gap   |
| ---------------------------------------------- | ------------------ | ------------------------- | --------- | ---------------- | ----------- |
| Baseline (rules as they stand)                 | 6.40 / 6.15 / 7.52 | 11 (5) / 12 (3) / 13 (6)  | 23/27/23% | 7.4 / 7.1 / 8.6  | 233/252/223 |
| Skip brackets any chain from its source        | 4.45 / 6.43 / 6.34 | 7 (5) / 10 (3) / 8 (6)    | 22/20/14% | 6.2 / 6.8 / 10.6 | 144/205/384 |
| Skip brackets the single chain from its source | 4.08 / 6.09 / 8.99 | 1 / 1 / 1                 | 6/9/10%   | 5.0 / 6.3 / 8.7  | 215/208/523 |
| Every skip descends (`SOUTH, NORTH`)           | 4.93 / 6.22 / 7.63 | 0 / 0 / 0                 | 0/2/1%    | 5.8 / 5.7 / 9.1  | 221/193/387 |
| **Skips get no face: ELK chooses**             | 5.02 / 7.07 / 5.73 | 0 / 0 / 0                 | 0/5/4%    | 7.6 / 7.8 / 9.2  | 209/220/370 |
| `mergeEdges: true`                             | unchanged          | unchanged                 | unchanged | unchanged        | unchanged   |
| `favorStraightEdges: false`                    | 7.69 / 6.52 / 6.50 | unchanged                 | 17/14/18% | 9.4 / 7.2 / 10.1 | 266/207/260 |
| both + thoroughness 30 + two-sided greedy      | 5.02 / 5.52 / 4.46 | unchanged                 | 23/18/20% | 7.0 / 7.0 / 11.4 | 172/203/181 |

Read together:

- A semantic column rule cannot be written. A hub reaches everything
  downstream, so "brackets a chain" is true of every hub skip; restricting it
  to a single chain leaves one long flank per board that alone costs 6 to 10
  percent corridor ink; and the only fixture skip the narrowest rule keeps
  does not exist. Columns are a geometric fact ELK creates, and the rule asks
  for it before ELK runs.
- Flipping ELK options while faces stay fixed moves little: the fixed ports
  set the width, and `mergeEdges` does nothing because every edge has its own
  port.
- Removing the face decision for skips is the one change that removes the
  corridors without a fan of long descents from the hub: on board 3 the
  page is 24 percent smaller than baseline, the hub's departures leave as one
  trunk, and bends rise 7 percent. Board 2 grows 15 percent, because ELK now
  routes its long edges between rows that were previously corridors; that is
  the trade the note predicted and needs the layering work (TASK-233) to
  recover.
- Ten renderer tests fail under any of the descent variants. They pin the
  flank design for skips leaving a hub: lane nesting on the west face, flank
  labels clearing corridors, the predecessor's flank routes. They are
  descriptions of the current output, not of what a reader needs.

## 4. Recommendations

Ordered by what I would do first. Each one is a task; the first three are the
answer to "do we need to re-evaluate the rule set": yes, but one family of
it, not all of it.

1. **Stop deciding faces for forward skips before layout.** Keep the faces
   that carry a reading convention (adjacent forward = down the page, return
   = right flank, containment = the frame's top or bottom) and give a skip
   no fixed port at all: source and target are the nodes, and ELK's
   orthogonal router picks the face that fits its own columns. This is
   measured above and is the only variant that improves board 3 without
   inventing a fan. It replaces rules 7 (skip branch), `hasTopApproach` and
   the reseating in `compound-flanks.ts`, since ELK no longer needs telling
   that a flank approach would cross a card.
2. **Re-derive the ten flank tests as invariants a reader cares about**, not
   face assertions: no route ink in a margin corridor beyond a small share,
   no route through a card, a skip beside its own chain still drawn beside it
   when the target sits in the source's column _after_ layout, labels on
   their own route and off others. `measure.ts` already computes most of
   these; make its checks the owners, on the three fixtures plus the S14
   boards from the 2026-09-15 batch as a fourth.
3. **If a face decision for skips must stay ours, make it geometry-informed
   for a first render too.** Every geometry-reading rule (`hasTopApproach`,
   `previousSides`, reseating) needs a predecessor drawing. Solve once with
   free faces, treat that drawing as the predecessor, and let the existing
   rules decide faces from real columns; one extra ELK solve per first
   render, no new rule family. This is the fallback if recommendation 1
   loses the bracket-beside-a-chain picture the user likes.
4. **Give hubs a trunk.** A card with many forward relationships should leave
   by one face with shared ports so ELK can bundle (`mergeEdges` works only
   on shared ports, which is why it measured as a no-op). Try after 1, on
   board 3's WSGI application.
5. **Labels nearest an endpoint (TASK-232).** The comparator in
   `label-runs.ts` prefers the longest run; put distance to the nearer
   endpoint first, longest run second. Also delete the dead
   `TAIL_LAYER`/`inline` settings or let ELK place labels with them; the
   contradiction (ELK told to place labels at the tail, then shown none)
   should not stand in the options table.
6. **Layering and spacing (TASK-233).** `NETWORK_SIMPLEX` layering with
   post-compaction, measured after 1 since the corridors set the width today.
   Replace the page-wide tallest-label spacing (rule 11) with per-edge label
   sizes: one long label should widen its own gap, not every layer.
7. **Rule hygiene**, none of it urgent: a direct test for cycle breaking; a
   test for the `previousSides` tie-break; move bridging into the layout
   owner so `layoutCompound` returns the painted curves; and read
   `compound-predecessor.ts`, `compound-node-hints.ts`, `compound-flanks.ts`
   and `compound-label-space.ts` (about 1,200 lines of incident-driven
   special cases) against what survives recommendation 1, since several of
   them exist to undo a flank ELK was forced into.

What not to change: ranking and cycle breaking (deterministic, semantic,
cheap), containment faces, boundary sections, the label clearances, rounding
and bridging, and the continuity contract for cards across variants. Those
rules encode meaning or reading habits; the skip faces encode a guess about
geometry.

## 5. What was done (2026-09-15, TASK-231)

Recommendation 1 landed with two refinements the measurements forced:

- Only a hub's skips are the engine's. A card with fewer than three forward
  relationships keeps one west-flank bracket for its nearest skip; a chain
  with a skip beside it stays in one column, which the engine alone does not
  keep (every placement option tried staggers the chain around the free
  skip's dummy nodes).
- Only on a first render. Under a predecessor the cards are pinned, and a
  free skip is routed as a staircase between them (26 points for a route that
  is a straight line on a first render), so a new skip in a proposal takes
  the flank, or the target's top when the predecessor drawing shows the
  target left of the source.

Measured on the three fixtures against the baseline at the top of section 3:

|                                             | Page (Mpx)         | West exits (max per card) | Corridor      | Bends per edge  |
| ------------------------------------------- | ------------------ | ------------------------- | ------------- | --------------- |
| Baseline                                    | 6.40 / 6.15 / 7.52 | 5 / 3 / 6                 | 23 / 27 / 23% | 7.4 / 7.1 / 8.6 |
| Hub skips engine-attached on a first render | 5.43 / 6.15 / 4.99 | 1 / 1 / 1                 | 21 / 9 / 8%   | 7.5 / 7.2 / 8.5 |

Board 1 keeps a long bracket from a non-hub card, which is most of its
corridor ink; that is the case recommendation 3 (a geometry-informed first
render) would settle. `tests/wide-boards.test.ts` holds the three fixtures to
these numbers with a little room, alongside no route through a card and no
card fanning more than one skip down its flank. Three tests that pinned flank
geometry were re-derived as the invariants they protected: the label on a
straight run of its own route, a bounded bend count, and a bridge on every
proper crossing.

## 6. Labels nearest an endpoint (2026-09-15, TASK-232)

Recommendation 5 landed: within each clear interval of a run the badge sits as
near the nearer end of its route as the interval allows, and candidates sort
by that reach before the run's length (an inherited position still comes
first). Median label gap to the nearer endpoint went from 233/252/223 px to
57/40/68 px and the maximum from 1345/1339/1413 to 191/178/243; no label on
boards 1 and 2 is over 200 px away, two on board 3. The cost is on board 2,
where reservations for badges beside their cards move the page from 6.15 to
6.65 Mpx and bends per edge from 7.2 to 8.0 (12 percent over the baseline 7.1,
above the 10 percent the task allowed); boards 1 and 3 are unchanged. The
`TAIL_LAYER` and `inline` options are still dead and belong to TASK-240.

## 7. Compaction (2026-09-15, TASK-233)

Measured on the tree after sections 5 and 6, network-simplex layering alone
grew every page (5.70 / 7.24 / 5.11 Mpx), network-simplex placement shrank
boards 1 and 2 but grew board 3 by 6 percent with bends up 8 percent, and
post-compaction `EDGE_LENGTH` moved cards off their layer lines (12 to 14
rows). Post-compaction `LEFT` shrank every page (5.43 / 6.65 / 4.99 to
4.96 / 5.75 / 4.45 Mpx, cells touched 21 / 20 / 25 to 25 / 23 / 28 percent)
with bends per edge unchanged, so that is what landed. Two limits: the engine
refuses to compact a hierarchy ("invalid hitboxes for scanline constraint
calculation"), so a board with a frame is laid out without it; and a
predecessor turns it off, since its cards are pinned where the reader last
saw them. The general crossing invariant in `tests/crossing-rounding.test.ts`
exposed a bridge defect on the way: a route whose end carried floating noise
(575.0000000000001 against 575) was never a straight run and never bridged.

## 8. A trunk for hubs (2026-09-15, TASK-239, not landed)

`mergeEdges` stays a no-op even with a hub's skips attached node to node,
since the engine still gives each its own port. Giving every hub skip one
shared south port instead shortens boards 1 and 2 (4.96 / 5.75 to
4.61 / 5.14 Mpx, bends 7.5 / 8.0 to 5.9 / 6.4 per edge) but pushes board 3,
the six-skip hub, to 7.27 Mpx with cells touched down to 17 percent: six
routes through one port need the width back. A trunk would have to open into
separate ports below the card, which is the engine's hyperedge routing and
not exposed to a layered graph. Left open.

## 9. Read on the dogfood boards (2026-09-16)

Two corrections after reading the vault's own boards. Post-compaction `LEFT`
staircased a plain fan (Command dispatch: five siblings each in its own row,
the entry card at the right), so it is gone; network-simplex node placement
took its place, which centres a card over the fan it feeds and keeps siblings
on their layer line, at 4.56 / 4.70 / 5.27 Mpx on the fixtures. And a
relationship a frame makes to a part inside it now leaves the bottom of the
frame's title band rather than the frame's outer top edge (Codex session), so
it no longer reads as arriving from outside. A card whose label the engine
had to reserve still drops a layer, since an inline reserved label is a
layer of its own to the engine; that is the remaining oddity on a small fan.

## 10. Brackets beside their own chain only (2026-09-16)

On the Browser application board two skips from different cards to one card in
another column each took the west flank as "the one bracket a non-hub card
keeps", and their two flank lanes snaked down the middle of the frame. The
bracket is now only the skip that runs beside its source's one chain to the
same target (the reader's bracket); every other skip is the engine's on a
first render. The fixtures measure 5.97 / 4.70 / 5.15 Mpx, corridor ink
7 / 16 / 0 percent, bends 7.1 / 7.5 / 8.3 per edge: board 1 pays a third in
page for losing its long bracket, board 3 loses its corridors. The rule that
sends a relationship across a frame boundary out the west flank was tried
free as well; the engine refuses a port-less edge across a hierarchy (no
route comes back), so that rule stands, and the four routes from inside a
frame to an external card still bundle down the frame's west edge.

## 11. The boundary flank rule is gone (2026-09-16)

A relationship across a frame boundary took the west face at both ends, a
rule that arrived with the skip routing and was never asked for; on the Agent
workbench board it sent a route from a card above a frame down the frame's
outside, round its bottom and back up into it. Such a relationship now takes
the same faces as any forward step (south out of the source, north into the
target, east for a return); only the ports on the frames it crosses sit on a
flank, since through a frame's top a route would cross the title band. Every
frame now draws a rule under its title, and a relationship the frame itself
makes to a part inside it hangs from that rule.

## 12. A label the runs cannot hold costs a row (2026-09-16)

The Semantic renderer board rendered tall and narrow after the flank rules
went: six of its labels found no run and were reserved with the engine, and a
reserved inline label is a layer of its own to the engine, so each cost a
row. The run pass demanded the node spacing (24) clear at both ends of a run
and around every card, which a direct descent between two rows can never
give a 31-tall badge. A second, tighter pass (8 clear) now runs before a
label is reserved; the proposal went from 819 by 1457 to 1231 by 1292 and
fixture board 1 from 5.97 to 5.01 Mpx. What still reserves a label there is
the engine spacing parallel departures 20 apart (`elk.spacing.edgeEdge`), so
no badge fits beside its own run without crossing a sibling's; widening that
spacing to 100 brought the board to 1457 tall but grew fixture board 3 by a
fifth, so it stays.

## 13. Fit in the reference pane is the measure (2026-09-16, TASK-245.02)

Page area was the layout suite's number, and area does not track what a
reader gets: a 997 by 1468 column and a 3952 by 460 ribbon are the same
area and fit the pane at 0.65 against 0.32. ADR 0028 makes fit the measure.
Fit is the scale at which the whole drawing shows in the reference pane,
capped at one: `min(pane.width / page.width, pane.height / page.height)`,
the arithmetic the viewer's own fit uses. The reference pane is derived in
`src/shared/shell-geometry/index.ts` from the desktop shell the product
supports: 1920 by 1080, less the 320 navigator, the 56 header, the 36 pane
bar and the 41 collapsed dock bar, less the 280 inspector drawn over the
diagram's right edge, less the 24 fit margin on every side, which is 1272 by 899. (TASK-245 estimated 952 tall before the pane bar and the dock were
counted.) The camera reads its margin and its fit arithmetic from that
module, the shell root and the inspector take their widths from it, and the
shell-layout browser owner holds the mounted shell's stage to it.

`src/runtime/semantic-renderer/tests/drawn-ink.ts` is the one owner of the
measurements, read by `tests/wide-boards.test.ts` and by `measure.ts`: fit,
routes through a card (frames excluded, since a route inside a frame crosses
it by design), the largest fan of skips down one card's flank, corridor ink,
bends per route and labels off a straight run of their own route. Bends here
are counted on the route without its bridges, as the suite always counted
them; sections 3 to 10 counted them with `measure.ts`, bridge hops included,
so those columns are not comparable with this one. The measure script now
prints these for every fixture and every vault board (`ALL=1` for every
variant, `PICTURES=1` for PNGs); its earlier layering and compaction modes
are gone, their results being recorded in sections 3 and 7 and in
[wide-board-layout.md](wide-board-layout.md).

The baseline, first renders on the tree at this section's commit:

| board               | page      |  fit | corridor | bends per route | labels off runs |
| ------------------- | --------- | ---: | -------: | --------------: | --------------: |
| flask-map-1         | 2312x1954 | 0.46 |       7% |             1.9 |               0 |
| flask-map-2         | 1815x2588 | 0.35 |      16% |             2.3 |               0 |
| flask-map-3         | 2566x1997 | 0.45 |       6% |             2.7 |               0 |
| Agent workbench     | 1440x1536 | 0.59 |       0% |             1.6 |               0 |
| Archboard           | 1210x629  | 1.00 |      10% |             1.3 |               0 |
| Board persistence   | 1705x850  | 0.75 |       0% |             1.5 |               0 |
| Board viewer        | 1376x1443 | 0.62 |       0% |             1.5 |               0 |
| Browser application | 1632x1297 | 0.69 |       0% |             1.5 |               0 |
| Canvas server       | 1338x1265 | 0.71 |      10% |             1.9 |               0 |
| Codex session       | 1111x986  | 0.91 |       0% |             0.2 |               0 |
| Command dispatch    | 1441x685  | 0.88 |       0% |             1.3 |               0 |
| Command interface   | 683x1027  | 0.88 |       0% |             0.3 |               0 |
| Renderer layout     | 910x780   | 1.00 |       0% |             0.8 |               0 |
| Semantic renderer   | 997x1468  | 0.61 |      17% |             1.3 |               0 |

No route runs through a card and no card fans more than one skip down its
flank on any of them. The suite holds every fit to this table less 0.02,
every fixture to its corridor share and bends with a little room, and every
vault board to three bends per route; a board the vault gains needs a row.
Nine of the fourteen are height-limited, which is what the reading-direction
work of TASK-245.03 is for.

## 14. A reading direction, chosen by fit (2026-09-16, TASK-245.03)

The layout could only read down the page: `elk.direction` was `DOWN` in one
line, and every face rule was a compass literal. ADR 0028 makes the reading
direction the renderer's decision. It is implemented as one solving frame,
the page reading down it, and a transposition: a board that reads left to
right has its measured sizes transposed, is solved in that one frame, and
has its drawing transposed back (`lib/layout/reading.ts`). The engine does
the same when told to lay out downward, so the transposed solve is the
layout it would have drawn told to lay out rightward, and every rule that
knew about a row, a lane, a flank or a label's height keeps working, in the
predecessor path included. The conventions are stated in reading terms
(forward out, forward in, the return flank, the flank beside a chain, the
frame's header side) and mapped to faces in that file; no compass literal is
left in any other layout module.

Two things had to be decided rather than rotated. A frame's title band stays
at the top of the page, so in the transposed frame it sits on the frame's
left and the frame's padding, the obstacle a label keeps off, the point a
frame's own call leaves from and the face a boundary crossing may use all
follow the header side. And a frame's own relationship (frame to part, part
to frame) runs along the reading, from the frame's back edge or onto its
front edge, never from a flank: a flank port on a frame is a hierarchical
port on a lateral face, and the engine's node placer crashes on it
(`nodeReps[other.id_0].tail` in the transposed solve of Codex session). The
same limit is why a boundary crossing in the transposed frame takes the
frame's foot rather than its left or right side.

A first render is settled both ways and the drawing with the higher fit in
the reference pane is kept, ties going down; a proposal keeps its
predecessor's direction; the choice is on the document as
`data-reading-direction` and on the rendered result as `readingDirection`.
`tests/reading-direction.test.ts` owns the choice, the tie, the inheritance
both ways and the determinism; a wide fan (one hub, sixteen dependents) is
the board that reads right, and a frame with such a fan inside it proves the
frame's own call comes in past the title band from the left edge.

Measured on every fixture and vault board, first renders, both readings:

| board               | down page, fit  | right page, fit | kept |
| ------------------- | --------------- | --------------- | ---- |
| flask-map-1         | 2312x1954, 0.46 | 7360x913, 0.17  | down |
| flask-map-2         | 1815x2588, 0.35 | 8199x805, 0.16  | down |
| flask-map-3         | 2566x1997, 0.45 | 8895x1041, 0.14 | down |
| Agent workbench     | 1440x1536, 0.59 | 4225x680, 0.30  | down |
| Archboard           | 1210x629, 1.00  | 1818x536, 0.70  | down |
| Board persistence   | 1705x850, 0.75  | 3470x675, 0.37  | down |
| Board viewer        | 1376x1443, 0.62 | 4778x603, 0.27  | down |
| Browser application | 1632x1297, 0.69 | 4353x796, 0.29  | down |
| Canvas server       | 1338x1265, 0.71 | 3262x716, 0.39  | down |
| Codex session       | 1111x986, 0.91  | 3031x571, 0.42  | down |
| Command dispatch    | 1441x685, 0.88  | 2025x562, 0.63  | down |
| Command interface   | 683x1027, 0.88  | 3229x376, 0.39  | down |
| Renderer layout     | 910x780, 1.00   | 2288x388, 0.56  | down |
| Semantic renderer   | 997x1468, 0.61  | 4433x433, 0.29  | down |

A plain rotation loses on every board, the chain-shaped ones most: a
seven-rank pipeline read left to right is a ribbon four times the pane's
width, because the gap between layers has to hold each label's width rather
than its height and every reserved label adds a column of its own. The
ribbons here are wider than the sandbox's 2026-09-16 numbers (Semantic
renderer 3952 against 4433) because the sandbox rotated the faces but kept
the between-layer room sized by label height. Sizing that room by the
label's short side in both readings was measured too: it reproduces the
sandbox's pages (Command interface 2889x276, Command dispatch 1615x562,
Semantic renderer 3636x471, flask-map-1 4725x930) and a rightward reading
still loses on every board, Command dispatch nearest at 0.79 against 0.88.
It was reverted, since a badge on a track across the layers then has no
room. So the direction machinery
lands with every board still reading down, and the fit table of section 13
is unchanged; what makes the chain boards read left to right is folding the
ribbon, which TASK-245.06 measures. The reader invariants hold in both
readings: `drawn-ink.ts` measures corridors and flank fans along the
reading, and the tests that pinned rows or faces (the chain, the loose
nodes, the inserted stage, the ghost rows, the new terminal's layer, the
containment calls, the added skip, the nested lanes) now say ahead, behind,
beside and along instead.

## 15. Faces under a predecessor come from solves, not guesses (2026-09-16, TASK-245.04)

What landed: under a predecessor, a relationship that survives keeps its
drawn faces, and a relationship the proposal adds is no longer given a face
from ranks or from where the predecessor put the cards. `hasTopApproach` and
the flank reseating in `compound-flanks.ts` are deleted, with the file. The
proposal is settled twice instead (`lib/layout/proposal-skips.ts`): once
with the added skips on the faces a first render of the same content gives
them, once with no fixed face, and the drawing with no route through a card,
then the fewer bends over the whole drawing, is kept. That is one first
render and one extra settle, only for a proposal that adds relationships.
Neither reading alone holds: with the first render's faces the added skip in
`skipped-connections` runs through a card the predecessor pinned in its way;
with no face the added route in `predecessor-routing` snakes round a pinned
card (six turns). The vault's three proposals (Canvas server, Renderer layout
and Semantic renderer, each Readable layout) draw identically before and
after. A one-skip edit of each fixture, first card to last:

| proposal         | before page, bends | after page, bends |
| ---------------- | ------------------ | ----------------- |
| flask-map-1+skip | 2312x2164, 2.1     | 2312x2164, 2.1    |
| flask-map-2+skip | 1876x2590, 2.3     | 1815x2753, 2.8    |
| flask-map-3+skip | 2616x2106, 2.8     | 2616x2161, 2.9    |

flask-map-3's edit draws two routes through cards both before and after;
that is not this change and is left open.

TASK-237 is fixed: a relationship between a frame and a card outside it gets
no fixed face at all. With a proposal pinning the cards, a fixed face on a
frame crashed the engine (`nodeOrder[l][0].layer`) whichever face it was,
inherited or from ranks; node to node the engine accepts it. No vault board
or fixture has such a relationship, so no measurement moved;
`tests/frame-relationships.test.ts` holds both directions.

What was measured and rejected: the bracket. Leaving every forward skip to
the engine on a first render removes corridor ink (flask-map-2 16 to 2
percent) and costs fit: flask-map-1 0.46 to 0.44, flask-map-2 0.35 to 0.31,
flask-map-3 0.45 to 0.37, Board viewer 0.62 to 0.51. The chain beside a skip
staggers around the skip's dummy nodes, as section 5 found. No engine option
measured recovers it on every board:

| free skips, and               | flask 1 | flask 2 | flask 3 | Board viewer | Board persistence | Semantic renderer |
| ----------------------------- | ------: | ------: | ------: | -----------: | ----------------: | ----------------: |
| network-simplex placement     |    0.44 |    0.31 |    0.37 |         0.51 |              0.75 |              0.61 |
| Brandes-Köpf placement        |    0.48 |    0.33 |    0.44 |         0.47 |              0.67 |              0.72 |
| Brandes-Köpf, balanced        |    0.42 |    0.32 |    0.40 |         0.44 |              0.74 |              0.69 |
| linear-segments placement     |    0.35 |    0.30 |    0.42 |         0.47 |              0.75 |              0.49 |
| network-simplex layering      |    0.41 |    0.29 |    0.32 |         0.53 |              0.75 |              0.72 |
| straightness 10 on each step  |    0.36 |    0.32 |    0.35 |         0.52 |              0.75 |              0.69 |
| faces fixed from a free solve |    0.46 |    0.39 |    0.43 |         0.46 |              0.62 |              0.55 |
| **bracket kept (baseline)**   |    0.46 |    0.35 |    0.45 |         0.62 |              0.75 |              0.61 |

So `brackets.ts` stays: a skip beside its source's one chain is a reading
convention that earns its fit, like the step and the return. What is gone is
every rule that guessed a face from the predecessor's geometry.

## 16. ELK model order in place of the seeding (2026-09-16, TASK-245.05, rejected)

The seeding that keeps a proposal's cards where its predecessor put them
(`compound-predecessor.ts`, `compound-node-hints.ts`,
`compound-label-space.ts`: interactive strategies, pinned positions, port
offsets, seeded routes and lanes for new cards) was tried against ELK's own
continuity mechanism. The spike ordered every level's children by the
predecessor's placement (along the reading, then across it, new cards last
by id) and the edges by the predecessor's order, set
`considerModelOrder.strategy` to `NODES_AND_EDGES` with
`crossingMinimization.forceNodeModelOrder`, and seeded nothing.

Measured against the predecessor's own first render: card move is the mean
distance a surviving card moved, ink the total route length, through the
routes crossing a card.

| proposal                          | seeding: fit, card move, bends, ink, through | model order: fit, card move, bends, ink, through |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| Canvas server @ Readable layout   | 0.71, 0, 1.9, 11317, 0                       | 0.71, 0, 1.9, 11317, 0                           |
| Renderer layout @ Readable layout | 1.00, 349, 1.6, 1712, 0                      | 1.00, 269, 0.8, 1391, 0                          |
| Semantic renderer @ Readable      | 0.66, 59, 1.5, 7010, 0                       | 0.66, 239, 1.2, 6165, 0                          |
| flask-map-1 + one skip            | 0.42, 141, 2.1, 31433, 0                     | 0.41, 584, 2.1, 37929, 1                         |
| flask-map-2 + one skip            | 0.33, 88, 2.8, 35845, 0                      | 0.36, 397, 2.1, 38370, 1                         |
| flask-map-3 + one skip            | 0.42, 66, 2.9, 42685, 2                      | 0.33, 615, 2.9, 52074, 0                         |

Canvas server's proposal changes nothing the layout reads, so both reuse the
predecessor's geometry without solving. Model order keeps the order of cards
within a layer, not the layers or the lanes: on the fixture edits cards move
four to nine times as far, a route runs through a card on two of them, and
flask-map-3 loses 0.09 of fit. It fails four continuity tests (new dependent
cards in nearby free space, badge room beside an inherited return, a new
terminal sharing its sibling's layer, a flank connection keeping the chain
in one column). It draws fewer bends and less ink on the two smaller vault
proposals because it is free to re-lay them, which is what continuity exists
to prevent. The seeding stays.

## 17. A flat chain folds toward the pane (2026-09-16, TASK-245.06)

A first render of a board with no frame is now also settled folded: the
engine's layered wrapping cuts the layers into lines toward the reference
pane's shape (`lib/layout/reading-choice.ts`), in each reading direction. A
folded reading is a candidate only when the engine lays it out, its bends
stay within the wide-board bound (three per route) and it carries at most one
route across its folds; the kept drawing is the best fit, ties going to the
earlier candidate (down, right, down folded, right folded). A proposal keeps
its predecessor's fold. The document carries `data-reading-wrapped="true"`.

Folded left to right loses on every board (Command interface 0.79, Semantic
renderer 0.38 against 0.88 and 0.61 unfolded down). Folded down, a pipeline
becomes columns of a newspaper. With the engine's `MULTI_EDGE` strategy, the
one the analysis tried, Command interface folds to 1301x733 (0.98) and
Semantic renderer to 1527x1199 (0.75), but the rasterised Semantic renderer
carries four routes across the fold, each looping round the whole page, and
reads worse than the column it replaces; hence the one-route rule, which
keeps it unfolded. `MULTI_EDGE` also throws inside the engine on flask-map-2
(`property.getDefault`, with its reserved labels as label nodes) where
`SINGLE_EDGE` lays the same graph out; `tests/engine-wrapping.test.ts` holds
that captured graph against the engine directly. `SINGLE_EDGE` is what
landed:

| board             | unfolded down  | folded down (single edge) | kept                   |
| ----------------- | -------------- | ------------------------- | ---------------------- |
| Command interface | 683x1027, 0.88 | 1012x805, 1.00            | folded, one fold route |
| Semantic renderer | 997x1468, 0.61 | 997x1468, 0.61 (no cut)   | down                   |
| every other board | unchanged      | unchanged or not better   | down                   |

A narrower fold target than the pane's shape only loses (Command interface
stops folding at an aspect of 1.2). The analysis saw wrapping throw on every
framed board; this transposed solve does not reproduce that, and the engine
cuts no framed vault board, so frames stay excluded as the task decided until
one is measured folding well.

So of the four chain-shaped boards TASK-245 named, one, Command interface,
now fills the pane (0.88 to 1.00), as a folded pipeline read down in two
columns rather than a row. Semantic renderer, Board viewer and Codex session
still read down unfolded, at 0.61, 0.62 and 0.91: no rightward or folded
reading measured better without looping routes round the page. The lever
left for them is the room between layers (TASK-239, TASK-242).

## 18. The scorecard (2026-09-16)

Sections 13 to 17 judged layouts by fit in the pane, and fit alone misleads:
flask-map-2 fits the pane a little better with its skips on the flank while
its page grows from 4.70 to 6.65 megapixels, most of it empty; a side-entry
experiment spread Canvas server wider and emptier while cutting its crossings
from 9 to 5. No single number decides whether a drawing is better.

`src/runtime/semantic-renderer/tests/drawn-scorecard.ts` measures every
drawing on ten measures, each with the direction a reader wants it to
move:

| measure              | better | what it says                                           |
| -------------------- | ------ | ------------------------------------------------------ |
| fit                  | higher | scale the whole drawing shows at in the reference pane |
| megapixels           | lower  | page area                                              |
| card share           | higher | share of the page under cards; the rest is empty space |
| route length         | lower  | total length of every route                            |
| bends per route      | lower  | turns a reader follows along one route                 |
| crossings            | lower  | right-angle crossings between two routes               |
| lane ink             | lower  | share of route length in margin lanes beside no card   |
| flank fan            | lower  | most routes leaving one card by its beside flank       |
| routes through cards | lower  | invariant, must be zero                                |
| labels off runs      | lower  | invariant, must be zero                                |

`measure.ts` prints it for every fixture and vault board; `SAVE=run.json`
keeps a run and `AGAINST=run.json` compares a later run measure by measure,
naming each one that moved and whether it moved the way a reader wants. A
layout change is reported that way, with the pictures, and every comparison
from here on uses it. The label check now allows a unit of snapping: a
Canvas server label reported off its line sat 0.88 units from it, which no
reader can see.

Side ends and labels on horizontal runs were measured for a day and taken
off the scorecard: they are ways a person corrects one layout so it reads
better, not measures of how well a layout reads.

## 19. Entering a card from the side (2026-09-16, rejected)

Every route today leaves its source's bottom and enters its target's top:
across the fourteen boards and fixtures, over 90 percent of route ends are on
a top or bottom face, because the layered engine attaches a port-less link
there when the page reads down and only takes a side face when one is fixed
before the solve. Two experiments let a forward link whose source sits wholly
beside its target enter the target's facing side, reading the positions off
a first solve. Neither is on the branch.

Solved again from scratch, the side choices moved the cards they were read
from. Measured against today: Semantic renderer fit 0.61 to 0.67 but 1.46 to
1.72 megapixels and crossings 8 to 4; Canvas server 1.69 to 2.34 megapixels,
fit 0.71 to 0.54, route length +17 percent, crossings 9 to 5; Board viewer
1.99 to 2.13 megapixels, bends per route 1.5 to 1.8. Page area grew on nine
of fourteen boards and bends on nine; crossings fell on six and rose on three.

Solved again with the first solve's cards pinned through the proposal seeding
(one settle, then a second with that drawing as the predecessor), the routes
had to snake round cards that no longer suited their ports, and it is worse
on nearly every measure: routes through cards on nine boards (flask-map-3
11, Board persistence 6), bends per route roughly doubled (Semantic renderer
1.3 to 2.9, Board persistence 1.5 to 4.6), route length up on every board
(Codex session 1162 to 7468), fit down on eleven (Board persistence 0.75 to
0.50) and page area up on all fourteen (Board persistence 1.45 to 3.05
megapixels). A side face chosen from where a first solve put the cards does
not hold once the cards are placed for that face; placement and face have to
be decided together, which the layered engine does not do on its own.

## 20. Empty rows between cards (2026-09-16, TASK-245.07)

A gap between two rows of cards was a label's height plus 24 above and 24
below, 79 units for a one-line badge between 72-unit cards, and a label
reserved with the engine added its own height and one more such gap, 110
units (two cards with one forced reservation: gap 79 without, 189 with; the
label's width does not enter it). Two changes take the empty room back.

A reserved label was usually not drawn where it was reserved. The run pass
places every label again after the solve and prefers the run nearest a route
end, so on Canvas server `owns listener` and `runs backend` were reserved at
y 231 and drawn at 120 and 148, and the band above HTTP application held
nothing for about 150 units. Reservations only ever grew. Now, once every
label has a box, the reservations whose labels sit elsewhere are released,
all together and then one at a time, and a release is kept only when every
label still has a box and the page is no taller, no larger in area, smaller
in one of the two, and no more crossed. Each condition was earned: height
alone let Command dispatch spread from 1441x685 to 1636x643; an equal page
only rerouted flask-map-2 (route length, a crossing and lane ink worse); and
a narrower page unnested two routes to one card so they crossed (the
same-destination nesting test). `label-reservations.ts` owns it.

The clearance a label keeps from a card and from the ends of its run is 16
(`elk.spacing.labelNode`), so a gap between rows is a label plus 16 above and
16 below: 63 for a one-line badge. Between badges it stays 24.

Measured together against the tree before, every variant of every vault
board and the three fixtures (scorecard, section 18):

| board               | page before | after     | fit          | megapixels   | worse on                   |
| ------------------- | ----------- | --------- | ------------ | ------------ | -------------------------- |
| flask-map-1         | 2312x1954   | 2311x1804 | 0.46 to 0.50 | 4.52 to 4.17 | nothing                    |
| flask-map-2         | 1815x2588   | 1815x2373 | 0.35 to 0.38 | 4.70 to 4.31 | nothing                    |
| flask-map-3         | 2566x1997   | 2566x1901 | 0.45 to 0.47 | 5.12 to 4.88 | nothing                    |
| Agent workbench     | 1440x1536   | 1372x1390 | 0.59 to 0.65 | 2.21 to 1.91 | nothing                    |
| Archboard           | 1210x629    | 1210x581  | 1.00         | 0.76 to 0.70 | nothing                    |
| Board persistence   | 1705x850    | 1705x802  | 0.75         | 1.45 to 1.37 | nothing                    |
| Board viewer        | 1376x1443   | 1376x1315 | 0.62 to 0.68 | 1.99 to 1.81 | nothing                    |
| Browser application | 1632x1297   | 1632x1185 | 0.69 to 0.76 | 2.12 to 1.93 | nothing                    |
| Canvas server       | 1338x1265   | 1254x1169 | 0.71 to 0.77 | 1.69 to 1.47 | nothing                    |
| Codex session       | 1111x986    | 1111x906  | 0.91 to 0.99 | 1.10 to 1.01 | nothing                    |
| Command dispatch    | 1441x685    | 1441x637  | 0.88         | 0.99 to 0.92 | nothing                    |
| Command interface   | 1012x805    | 1012x725  | 1.00         | 0.81 to 0.73 | nothing                    |
| Renderer layout     | 910x780     | 910x716   | 1.00         | 0.71 to 0.65 | nothing                    |
| Semantic renderer   | 997x1468    | 819x1291  | 0.61 to 0.70 | 1.46 to 1.06 | bends per route 1.3 to 1.6 |

Release alone moved only Agent workbench, Canvas server and Semantic
renderer; the clearance moved every board. The scorecard's route reader now
drops the points a removed bridge leaves a fraction of a unit off its run,
which a proposal test had been counting as turns.
