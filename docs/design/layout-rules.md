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
