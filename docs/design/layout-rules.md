# The architecture layout rules, mapped

What the compound renderer decides itself, what it leaves to ELK, and where
the two disagree. Written on 2026-09-15 after TASK-231 (route a forward skip
to another column as a descent) could not be finished by adding a rule, and
measured on the three Flask module maps of
[wide-board-layout.md](wide-board-layout.md) with `measure.ts`. Rule numbers
below are the dated inventory's; file references describe the tree at that time.
[Section 28](#28-every-variant-is-laid-out-fresh-2026-09-19-task-276) records the
removal of predecessor geometry constraints under ADR 0032.

The painter is no longer TypeScript. Since TASK-520.03 (2026-10-24) the renderer
core in Rust paints the drawing that layout answers, bridges and all
([ADR 0057](../adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)),
so where a rule below says it runs in the painter, it runs in
`crates/archboard-scene/src/paint/`.

Traffic no longer has a place where it rests, so layout owes it nothing. Sections
40 to 43 once held rules about where a still picture rested a traffic streak
(`comet-rest.ts`). They were removed on 2026-10-04 with that code. A still picture
now shows the whole train of pulses at its phase
([ADR 0027](../adr/0027-explicit-traffic-controls-distance-based-animation.md)).

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
    curves are not the painted ones. Two routes whose rows at their cards lie
    on one line and overlap in opposite directions first exchange lanes
    (`folded-crossings.ts`), so their crossing lands on straight runs.

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

Superseded on 2026-09-27 by ADR 0039: a drawing is measured first by how easily
it reads, and fit only breaks ties. The reference pane below stays the
yardstick for fit.

How each engine's choices weigh fit since ADR 0039:

- **One comparison** (`track/score.ts` `readingOrder`). Two layouts are
  compared on four numbers in the ADR's order, and a later number decides
  only between layouts equal on every earlier one: crossings; hooks; bends;
  route length (equal within a twentieth); then fit, then the smaller page.
  An engine that does not count a number leaves it equal. Graphviz weighs its
  settled drawing (`even-pins.ts` `drawingWeighed`) on its crossings seen
  (`crossingsSeen`: each place two lines cross, one more for each within a
  lane of a line's bend, and one for each stretch of at least a lane on which
  two unrelated lines share one stroke) and its hooks (side hooks, lines that touch, crowded joins). The
  track and blocks engines weigh their lines as drawn on crossings, bends and
  route length (`blocks/weighing.ts`); where a block of cards chooses whether
  to stack, a line lapping round it past every card it holds counts as a
  crossing more, the label on it not hiding the lap (One write lands, Track,
  sent 'announce the accepted write' down the page's right edge stacked). No
  chooser ADR 0039 changed weighs double tracks (unrelated lines closer than
  a lane; lines exactly a lane apart stand at the routers' channel pitch and
  are not one), nor do Track and Blocks weigh hooks, nor Graphviz bends or
  length: weighing them changed no drawing in either vault. Graphviz's route
  settlement (`even-pins.ts` `defectsIn`), which the ADR did not change, does
  refuse double tracks and lines on one stroke among its defects.
- **The guard** (`takes`), on every chooser ADR 0039 changed. The chooser
  weighs its two layouts as it did before the ADR and on its reading pick.
  The reading pick is taken where the two agree, or where it is no worse than
  the earlier pick on every number the engine counts; else the earlier pick
  stands, fit included. Two whole drawings often trade one number for
  another, and on the reading pick alone What the CLI can be asked (Blocks)
  parted two lines into Board client for two hops fewer at 14% more line;
  Archboard server whole (Track) packed its groups for 13 hops fewer at 23
  more bends; One command from a pane (Blocks) held a port order for two
  crossings fewer and ran three unrelated lines side by side along its
  bottom; Host seam (Track, Blocks) wrapped for one hop fewer and ran two
  lines 16 px apart for 429 px into Renderer host.
- **The reading picks.** Whether a block's containers stack, and whether a
  board drawn inline packs its group regions: the comparison. The earlier
  weighings: stacking on each way's score at its best, folded or not, a near
  tie going to the page that fits clearly better; packing where it scores
  higher, draws no more line and fits no worse. The joins: the way that
  parts fewer joins, then the comparison; their earlier weighing is their
  crossings, half as much again for each line through one past the first,
  with their line at a crossing's worth for 1000 px, fit deciding between
  costs within a twentieth. The joins and the packing weigh their drawings
  with the steps their lines need not take taken out, both ways; before the
  ADR the joins' weighing ran on the stepped drawing. Graphviz's column
  fold: a fold that fits the pane a twentieth better (`WRAP_MIN_FIT_GAIN`)
  and reads no worse on the comparison. Its earlier weighing: that fit gain,
  and a higher score.
- **Kept on the earlier weighing.** Port settlement keeps its score (fit less
  a share for each crossing, its lines' detours counted as crossings at the
  trunk router's rate), weighed before the lines' steps are taken out: held
  to the guard, Public ownership (Common-WebLib, Blocks) settled into four
  crossings more and IIS data (Cloud Infrastructure, Blocks) one. The held
  port order (fewer crossings, no more bends) and the board's wrap (a tenth
  more score) keep their rules: the guard took their earlier pick on every
  board of both vaults. Chosen before the drawing exists, on their score, the
  wrap of a block inside the board (`wraps.ts`) and the fold of a block of
  cards (`fold.ts`), estimated with the block's unfolded crossings and a line
  between its columns at eight crossings. A block of blocks' packing
  (`pack.ts`) is chosen on its score too, and is the one change outside the
  guard: two packings that score alike go to the smaller page, where the
  first tried stepped Reading a board's 'one stage per pane' (Blocks) down
  three bends alongside 'a board's new version'. Which packings are laid
  out at all is still bounded by their estimated fit (`packings.ts`).

Page area was the layout suite's number, and area does not track what a
reader gets: a 997 by 1468 column and a 3952 by 460 ribbon are the same
area and fit the pane at 0.65 against 0.32. ADR 0028 makes fit the measure.
Fit is the scale at which the whole drawing shows in the reference pane,
capped at one: `min(pane.width / page.width, pane.height / page.height)`,
the arithmetic the viewer's own fit uses. `packages/renderer/src/shared/constants/shell-geometry.ts`
holds two kinds of number. The shell's are measured: 1920 by 1080, less the
320 navigator, the one-pixel line between the navigator and the panes, and the
pane's 40 chrome row, which leaves a stage of 1599 by 1040. Nothing runs under
the panes: the agent dock is at the navigator's foot. The renderer's page shape
is tuned, not measured: `LAYOUT_ASPECT`, a plain 1.4 (ADR 0043). The reference
pane takes its width from the shell, the stage less the 280 sidebar docked
beside the picture and the 24 fit margin on either side, which is 1271, and
its height from that aspect, about 908. The grid of loose cards and the wrap
of a wide rank read the aspect alone. (Until 2026-10-05, TASK-395, the pane
was derived whole from the shell before its redesign, a 56 header, a 36 pane
bar and a 41 agent bar, which made it 1272 by 899: the fits recorded before
that date are against that pane. Matched to the redesigned shell it became
1271 by 992, and 18 of 130 drawings moved. ADR 0043 records why the height
now comes from the tuned aspect. At 1.4, 2 of the 130 move: Browser
application's Working with an agent and its whole board, both Blocks.
TASK-245 estimated 952 tall before the pane bar and the dock were counted.)
The camera reads its margin and its fit arithmetic from that module, the
shell root takes the navigator's width and the chrome row's height from it
and the sidebar its width, and the shell-layout browser owner holds the
mounted shell's stage, chrome row and docked picture width to it.

`packages/renderer/tests/runtime/support/drawn-ink.ts` is the one owner of the
measurements, read by `tests/wide-boards.test.ts` and by `measure.ts`: fit,
routes through a card (frames excluded, since a route inside a frame crosses
it by design), the largest fan of skips down one card's flank, corridor ink,
bends per route and labels off a straight run of their own route; how far a
label sits from the line's nearer end and the corridors two routes share
joined them in section 25. Bends here
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
| Archboard server    | 1338x1265 | 0.71 |      10% |             1.9 |               0 |
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
| Archboard server    | 1338x1265, 0.71 | 3262x716, 0.39  | down |
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
card (six turns). The vault's three proposals (Archboard server, Renderer layout
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

| proposal                           | seeding: fit, card move, bends, ink, through | model order: fit, card move, bends, ink, through |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| Archboard server @ Readable layout | 0.71, 0, 1.9, 11317, 0                       | 0.71, 0, 1.9, 11317, 0                           |
| Renderer layout @ Readable layout  | 1.00, 349, 1.6, 1712, 0                      | 1.00, 269, 0.8, 1391, 0                          |
| Semantic renderer @ Readable       | 0.66, 59, 1.5, 7010, 0                       | 0.66, 239, 1.2, 6165, 0                          |
| flask-map-1 + one skip             | 0.42, 141, 2.1, 31433, 0                     | 0.41, 584, 2.1, 37929, 1                         |
| flask-map-2 + one skip             | 0.33, 88, 2.8, 35845, 0                      | 0.36, 397, 2.1, 38370, 1                         |
| flask-map-3 + one skip             | 0.42, 66, 2.9, 42685, 2                      | 0.33, 615, 2.9, 52074, 0                         |

Archboard server's proposal changes nothing the layout reads, so both reuse the
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
experiment spread Archboard server wider and emptier while cutting its crossings
from 9 to 5. No single number decides whether a drawing is better.

`packages/renderer/tests/runtime/support/drawn-scorecard.ts` measures every
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
Archboard server label reported off its line sat 0.88 units from it, which no
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
1.72 megapixels and crossings 8 to 4; Archboard server 1.69 to 2.34 megapixels,
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
end, so on Archboard server `owns listener` and `runs backend` were reserved at
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
| Archboard server    | 1338x1265   | 1254x1169 | 0.71 to 0.77 | 1.69 to 1.47 | nothing                    |
| Codex session       | 1111x986    | 1111x906  | 0.91 to 0.99 | 1.10 to 1.01 | nothing                    |
| Command dispatch    | 1441x685    | 1441x637  | 0.88         | 0.99 to 0.92 | nothing                    |
| Command interface   | 1012x805    | 1012x725  | 1.00         | 0.81 to 0.73 | nothing                    |
| Renderer layout     | 910x780     | 910x716   | 1.00         | 0.71 to 0.65 | nothing                    |
| Semantic renderer   | 997x1468    | 819x1291  | 0.61 to 0.70 | 1.46 to 1.06 | bends per route 1.3 to 1.6 |

Release alone moved only Agent workbench, Archboard server and Semantic
renderer; the clearance moved every board. The scorecard's route reader now
drops the points a removed bridge leaves a fraction of a unit off its run,
which a proposal test had been counting as turns.

## 21. Flank rules, chosen by the scorecard (2026-09-16, TASK-245.08)

Every flank rule measured this day drew some boards better and others worse:
forward skips left to the engine (section 15), every skip on the left flank
(before 1f370ce6), the mirror of that, and returns on the left with every skip
the engine's. So a first render is now drawn under each and the scorecard
keeps one; a proposal keeps its predecessor's rule, as it keeps its reading.
`flank-rules.ts` names the four:

| rule                | returns | forward skips over a rank                                   |
| ------------------- | ------- | ----------------------------------------------------------- |
| bracketed (default) | right   | a bracket beside a chain on the left, the rest the engine's |
| flanked             | right   | every one on the left                                       |
| mirrored            | left    | every one on the right; port order mirrored too             |
| returns-left        | left    | every one the engine's                                      |

The reading is chosen first under the default rule, then the other three are
settled in that reading only, so a first render costs three more settles and
not twelve (the measure run over every board went from about 2 to 10
seconds; solving every reading under every rule took 22). A folded reading
keeps the default rule.

`scorecard.ts` keeps the drawing that is better than the most others on the
measures of section 18, the default when they tie. Two things earned their
place. Another rule is a candidate only with no more crossings and no more
routes through cards than the default: freeing a skip over two steps made a
page smaller on five measures while crossing the first step and doubling the
bends. And a size (fit, page area, card share, route length, bends, lane ink)
counts only when it differs by more than 2 percent, a count (crossings, flank
fan) by any amount: a route two units shorter flipped a five-card board to
the mirrored rule.

Measured against the tree before, every variant of every vault board and the
three fixtures; the rest keep the default rule and their drawing:

| board                              | rule         | page before | after     | better                                                       | worse                                 |
| ---------------------------------- | ------------ | ----------- | --------- | ------------------------------------------------------------ | ------------------------------------- |
| flask-map-3                        | returns-left | 2566x1901   | 2229x1790 | fit, area, card share, length, bends, crossings              | nothing                               |
| Agent workbench                    | flanked      | 1372x1390   | 1349x1202 | fit 0.65 to 0.75, area, card share, length, crossings        | bends 1.5 to 1.6, fan 0 to 1          |
| Board persistence                  | mirrored     | 1705x802    | 1522x828  | fit 0.75 to 0.84, area, card share, length, crossings 9 to 7 | bends, lane ink 0 to 0.08, fan 0 to 3 |
| Archboard server                   | flanked      | 1254x1169   | 1316x924  | fit 0.77 to 0.97, area, card share, length, lane ink         | bends 1.9 to 2.1, fan 1 to 2          |
| Semantic renderer                  | flanked      | 819x1291    | 1062x987  | fit 0.70 to 0.91, area, length, bends, crossings 8 to 4      | lane ink 0.16 to 0.38, fan 1 to 2     |
| Semantic renderer, Readable layout | flanked      | 1454x1083   | 1591x933  | area, card share, length                                     | fit 0.83 to 0.80, lane ink            |

The wide-board suite holds each board to its recorded scorecard as a whole
instead of a fit floor and a fan bound of one: a board may not be worse on
more measures than it is better. The flank fan counts both flanks, since a
rule can put skips on either. Mirroring a kept drawing so its cards sit on
the left is a separate question and not done.

## 22. Render time (2026-09-16, TASK-245.09)

Sections 20 and 21 took a first render from about 100 ms to up to two
seconds: one render asked the engine for 10 to 150 solves. Counted by purpose
on four boards, most were label-release attempts made at the end of every
branch of the settle, then reservation rounds, repeated for four readings and
four flank rules. Nearly all the time is in the engine; building its graph
and reading its answer back is under 3 percent.

Kept, each leaving every drawing of every vault variant and fixture unchanged
on the scorecard:

- A settle asks the engine each distinct question once (`rememberSolves`).
- Only the drawing a settle keeps is released, not every branch before the
  shorter one is chosen.
- The engine runs in a pool of workers sized from the host, one fewer than its
  cores, started as solves find the running ones busy (`engine-pool.ts`).
- The first reading is settled; each other is solved once and settled only
  when that plain solve fits better than the first settled, since settling
  only adds rows.
- The other flank rules are settled for the down reading while the reading is
  being chosen, and again only when another reading wins; the grown-gap branch
  settles beside the reservation branch.
- A layout is remembered by its content and predecessors
  (`layoutRemembered`), so the other theme, another pane and every proposal
  that re-lays out its predecessors reuse it: about 1 ms.

Tried and dropped: screening readings and flank rules on one plain solve each
(seven boards chose a worse drawing, one put a label off its run); growing
the gap only on the first round (no gain); a linear release search (10 to 25
percent faster, flask-map-1 worse on four measures); reserving every label on
the second round (up to 5.8 seconds, worse drawings); Brandes-Koepf placement
(faster, but four boards worse on more measures); lower crossing
thoroughness and no greedy switch (little gain).

`timing.ts` beside `measure.ts`, first render with the engine warmed on
another board, then the median repeat:

| board               | before | first render                                  | repeat |
| ------------------- | ------ | --------------------------------------------- | ------ |
| flask-map-1         | 1697   | 400 to 500 warm, 1400 to 1850 on cold workers | 7      |
| flask-map-2         | 1832   | 780 to 900                                    | 2      |
| flask-map-3         | 1083   | 630 to 740                                    | 2      |
| Agent workbench     | 377    | 130                                           | 1      |
| Archboard           | 47     | 15                                            | 0      |
| Board persistence   | 671    | 120 to 280                                    | 1      |
| Board viewer        | 373    | 100 to 130                                    | 1      |
| Browser application | 172    | 115 to 140                                    | 1      |
| Archboard server    | 729    | 330 to 375                                    | 1      |
| Codex session       | 173    | 50 to 80                                      | 1      |
| Command dispatch    | 123    | 50 to 210                                     | 0      |
| Command interface   | 26     | 20 to 25                                      | 0      |
| Renderer layout     | 53     | 15 to 30                                      | 0      |
| Semantic renderer   | 898    | 160 to 190                                    | 1      |

A worker started for a render compiles the engine as it goes: the same
flask-map-1 render took 1552 ms on fresh workers and 400 ms on warm ones.
Under 150 ms on a first render is met by nine of the fourteen; Archboard server,
Semantic renderer, Board persistence and the three fixtures are not, and
what remains is the number of solves a first render's candidates need, which
only a change to what is chosen (fewer flank rules, lighter label settling,
another placement) would cut further.

## 23. The engine is elk-rs (2026-09-17, TASK-247)

The layout engine is now `@archboard/elk-rs` 0.11.1, the Rust port of ELK
from archboard's fork of openedges/elk-rs, as a native addon in Bun workers
and as WASM in browser workers. Before the switch, every solve archboard's
renderer tests send was captured and run through both engines. Wherever
elk-rs differed from the patched elkjs, the fork was fixed, each fix with a
parity test against stored elkjs output:

- a deadlock in interactive external port positioning
- a compound port correction Java does not have
- the prior bend points the elkjs patch carried
- 32-bit float arithmetic where elkjs computes in doubles

All 72 captured solves now match, and every scorecard in `wide-boards.test.ts`
holds. Multi-edge wrapping still fails inside the engine on the folded
fixture, as it did in elkjs, so section 17's single-edge choice stands.

`timing.ts`, first render with the engine warmed on another board, three runs:

| board               | elkjs, section 22 | elk-rs       | repeat |
| ------------------- | ----------------- | ------------ | ------ |
| flask-map-1         | 400 to 500        | 300 to 325   | 2      |
| flask-map-2         | 780 to 900        | 1140 to 1190 | 2      |
| flask-map-3         | 630 to 740        | 345 to 365   | 1      |
| Agent workbench     | 130               | 85 to 130    | 1      |
| Archboard           | 15                | 17 to 20     | 1      |
| Board persistence   | 120 to 280        | 95 to 115    | 1      |
| Board viewer        | 100 to 130        | 70 to 80     | 1      |
| Browser application | 115 to 140        | 65 to 70     | 1      |
| Archboard server    | 330 to 375        | 215 to 220   | 1      |
| Codex session       | 50 to 80          | 50 to 60     | 0      |
| Command dispatch    | 50 to 210         | 50 to 65     | 0      |
| Command interface   | 20 to 25          | 22 to 25     | 0      |
| Renderer layout     | 15 to 30          | 18 to 20     | 0      |
| Semantic renderer   | 160 to 190        | 110 to 115   | 1      |

The section 22 numbers predate measuring text with the drawing canvas
(TASK-247), which changes widths and so the candidates a board settles through.
flask-map-2 is the one board slower than there, and the engine is not why. On
this branch it makes 126 solves on either engine. elk-rs spends 2073 ms solving
and draws in 1174 ms; the patched elkjs spends 7781 ms solving and draws in
3303 ms. What grew is how many solves label settling needs with the new widths,
so that is where to look next. Ten of the fourteen are under 150 ms. The four
that are not are the three fixtures and Archboard server.

## 24. Where a first render's time goes (2026-09-17, TASK-247)

Timing each attempt directly showed where flask-map-2's first render spends
its time. Graph building takes 11 ms, placing labels on runs about 195 ms, and
waiting on the engine 2.0 s, summed over 126 overlapping solves. A CPU profile
put placement at 861 ms, but it samples badly across worker threads and the
direct timing is the one to trust. A render under Bun is therefore bound by
the engine.

Its solves also barely overlapped, for a reason inside the engine. One solve
of flask-map-2's largest graph took 13 ms alone, 17 ms each with four at
once, and 31 ms each with eight, on 24 cores. elk-rs 0.11.3 removed the
shared state the solves contended on:

- a lock around every option lookup
- a lock around property defaults
- glibc malloc, replaced by mimalloc
- shared reference counts

It is now 9.4 ms alone and 10.0 ms with eight at once. A browser gives each
worker its own WebAssembly instance and never had this contention.

Kept, each leaving every picture of every vault variant and wide-board
fixture byte-identical:

- Label placement grows cards, labels and route pieces once per placement
  rather than once per run, and skips obstacles that miss every interval.
  Relationship parts are grouped once. Routes whose extents do not touch skip
  the crossing search. Placement fell from about 195 to 110 ms per
  flask-map-2 render.
- A round of reservation releases solves all its candidates at once and keeps
  the first that holds, in order. Most rounds hold none, so the round solved
  every candidate anyway. On 0.11.2 this was slower (2516 to 3081 ms summed),
  because the solves contended. On 0.11.3 it is the largest gain.

`timing.ts` first renders under Bun, averaged over three runs, ms:

| board               | 0.11.2, section 23 | 0.11.3 | 0.11.3, parallel releases |
| ------------------- | ------------------ | ------ | ------------------------- |
| flask-map-1         | 290                | 199    | 121                       |
| flask-map-2         | 1125               | 779    | 376                       |
| flask-map-3         | 344                | 226    | 101                       |
| Agent workbench     | 81                 | 47     | 30                        |
| Archboard           | 16                 | 7      | 7                         |
| Board persistence   | 97                 | 46     | 33                        |
| Board viewer        | 73                 | 39     | 32                        |
| Browser application | 70                 | 38     | 24                        |
| Archboard server    | 218                | 125    | 77                        |
| Codex session       | 47                 | 25     | 16                        |
| Command dispatch    | 55                 | 29     | 28                        |
| Command interface   | 24                 | 12     | 12                        |
| Renderer layout     | 19                 | 8      | 8                         |
| Semantic renderer   | 111                | 65     | 41                        |
| sum                 | 2569               | 1645   | 907                       |

Thirteen of the fourteen are now under 150 ms, all but flask-map-2. Only the
three wide-board fixtures take more than 100 ms; every vault board takes less.

In the browser, over three runs across the eleven vault boards, the mean first
picture fell from 440 to 396 ms and a reopen from 287 to 272 ms. A reopen is
app boot, and a first picture adds about 30 ms of icon fetches and the layout.

Measured and not kept:

- Moving the renderer into a worker. Across 22 page loads no task over 50 ms
  came from drawing, so there was no responsiveness to gain.
- Letting the browser pool grow freely instead of one worker at a time: 396 to
  415 ms, no gain.
- Sharing one compiled engine across browser workers, WebAssembly SIMD and
  wasm-opt levels. None moved the time. The shared engine is kept for the
  compile work it saves.

## 25. A label's reach and the corridors two routes share (2026-09-17, TASK-256.12)

Every S14 run of the 2026-09-17T16-31-08 skill evaluation failed its visual
check, readability 4 and 5 out of 10, on boards of 18 to 20 parts and 32 to 41
relationships. The renderer's own measures could not see it: all six boards
draw no route through a card, no label off a straight run of its own route,
and 2.4 to 3.2 bends per route. What the grader reacted to had no measure at
all, so this section is the measurement, and only then what can be held.

Two measures joined `drawn-ink.ts`, which section 13 names as the one owner
the suite and `measure.ts` both read:

- **label reach**, the distance from a label to the nearer end of the line it
  names, measured from the badge's centre — the point `label-runs.ts` itself
  places by, so the renderer optimises the number the reader measures. Its
  scale-free form is the **label strand**: that distance over the distance
  between the two cards the line joins. Half is a label at the midpoint of a
  straight route; near one is a label stranded off the stretch of page its two
  cards occupy.
- **shared corridor**, the longest stretch over which two routes are drawn side
  by side, with the **corridor routes** a reader has to count across the widest
  such bundle, and the **shared ink**, the share of all route length that has
  another route beside it. Side by side is 24 units apart: the drawn
  separations are 20 and 21 (`elk.spacing.edgeEdge` is 20 and snapping moves a
  run a unit): of the 4,472 overlapping parallel pairs across every board
  measured here, 217 sit 21 units apart or closer and only 33 between 22 and
  30, the nearest of them at 26. A bundle counts
  only over 400 units, which is longer than any two routes share on a board the
  vault holds. Crossings and corridors are read off `corridorPoints`, so a
  bridge cannot hide one route behind another.

First renders on the tree at this section's commit, the new columns beside fit:

| board               | page      |  fit | label reach | strand | shared corridor | corridor routes | shared ink |
| ------------------- | --------- | ---: | ----------: | -----: | --------------: | --------------: | ---------: |
| flask-map-1         | 2311x1804 | 0.50 |         601 |   0.51 |             225 |               1 |       0.02 |
| flask-map-2         | 2916x1653 | 0.44 |        1181 |   0.52 |             829 |               3 |       0.09 |
| flask-map-3         | 2230x1790 | 0.50 |         486 |   0.58 |             864 |               3 |       0.08 |
| system-map          | 2859x2161 | 0.42 |        1519 |   0.94 |            1390 |               5 |       0.31 |
| Agent workbench     | 1349x1202 | 0.75 |         128 |   0.50 |              99 |               1 |       0.06 |
| Archboard           | 1210x581  | 1.00 |         114 |   0.50 |               0 |               1 |       0.00 |
| Board persistence   | 1522x828  | 0.84 |         392 |   0.50 |             362 |               1 |       0.14 |
| Board viewer        | 1376x1315 | 0.68 |         244 |   0.64 |               0 |               1 |       0.00 |
| Browser application | 1633x1185 | 0.76 |         149 |   0.50 |               0 |               1 |       0.00 |
| Archboard server    | 1317x924  | 0.97 |         319 |   0.54 |             382 |               1 |       0.18 |
| Codex session       | 1111x906  | 0.99 |          93 |   0.50 |               0 |               0 |       0.00 |
| Command dispatch    | 1441x637  | 0.88 |          78 |   0.21 |               0 |               1 |       0.00 |
| Command interface   | 1012x725  | 1.00 |         194 |   0.50 |               0 |               1 |       0.00 |
| Renderer layout     | 910x716   | 1.00 |         108 |   0.50 |               0 |               1 |       0.00 |
| Semantic renderer   | 1062x987  | 0.91 |         306 |   0.61 |             239 |               1 |       0.11 |

One route alone in a long run reads as one corridor route; two or more is a
bundle. The eight columns of section 13 and the recorded scorecards are
unchanged by this work: nothing in the layout moved, and `measure.ts` compares
this tree with a run of it before the measures existed as unchanged on every
fixture and every variant of every vault board.

The six graded boards, each run's own board measured the same way (copy the
run's `vault/Flask.semantic.json` content beside the fixtures and run
`measure.ts`):

| S14 run     | parts, relationships | page      |  fit | label reach | strand | shared corridor | corridor routes | shared ink |
| ----------- | -------------------- | --------- | ---: | ----------: | -----: | --------------: | --------------: | ---------: |
| baseline 1  | 20, 37               | 2648x3088 | 0.29 |        1368 |   0.65 |            1473 |               4 |       0.14 |
| baseline 2  | 18, 32               | 2733x1855 | 0.47 |         596 |   0.50 |             680 |               2 |       0.13 |
| baseline 3  | 18, 34               | 2773x2254 | 0.40 |         482 |   0.58 |            1071 |               2 |       0.14 |
| candidate 1 | 19, 32               | 2976x3966 | 0.23 |         744 |   0.54 |            1975 |               4 |       0.14 |
| candidate 2 | 20, 41               | 2738x3998 | 0.22 |         498 |   0.49 |            2253 |               5 |       0.28 |
| candidate 3 | 19, 32               | 2859x2161 | 0.42 |        1519 |   0.94 |            1390 |               5 |       0.31 |

Candidate 3 is now the `system-map` fixture, so the shape the grader failed is
measured on every run from here on. It is held to what a reader needs and to
nothing else: no route through a card, every label on a straight run of its own
route and within reach of one of its cards, bends inside the vault's allowance.
It has no recorded scorecard on purpose — the suite holds each board to its own
recording, so recording this one would make today's failing drawing the
standard and pass forever.

`timing.ts` reads the fixture directory the same way, and the system map is now
the second slowest first render on it, 288 ms against flask-map-2's 360 and
every vault board's under 80 (section 24's table is otherwise unmoved).

### What the numbers say, and what they do not justify

The label and the corridor are one defect, not two. The worst label on the
system map, `WSGI, HTTP, routing, and responses`, names a route between two
cards 1,614 units apart that are all but vertically aligned; the route is 4,655
units long, because it leaves the page's middle, runs to the right margin, down
the whole page and back. Its badge sits 1,519 units from both of its cards, out
on that lap, because the run beside its source is three parallel routes 21
apart and a 31-tall badge with its 12 of clearance fits in none of it. The
label goes wherever the corridor ends.

What is held now: a label is never farther from the nearer of its two cards
than those two cards are from each other (`LABEL_STRAND`). Thirteen of the
fifteen boards keep every label inside 0.64, the widest is the system map's
0.94, and nothing measures between. It is a bound a reader can state without
knowing the board's size.

What is not held, and why no figure was invented for it:

- **An absolute bound on either measure is a size limit in disguise.** Every
  board the vault holds keeps its label reach under 392 and shares no corridor
  longer than 382; every graded board is above both (482 to 1,519, and 680 to
  2,253). A threshold in the gap, say 400 and 400, separates the two
  populations perfectly — and fails all three Flask fixtures as well, which are
  15 parts and have drawn that way since section 13. The vault's boards are
  small, not better drawn; holding a twenty-part board to a twelve-part board's
  distances is a rule against large boards.
- **The share of ink does not separate at all**: Archboard server, which reads
  well, shares 0.18 of its ink, more than four of the six graded boards.
- **The tight bounds the population does support are the ones the fixtures
  fail**: a strand of 0.75 (13 of 15 boards are inside 0.64, the system map is
  0.94), no two routes side by side over 400 (every vault board passes, the
  system map shares 1,390), and no more than two routes in one corridor (every
  vault board has one, the system map five). Each of those is a target with
  evidence behind it, and each fails on a board that is on the branch today, so
  none of them can be a gate until the routing changes.

What would justify turning them on: the lap. A forward skip over many layers is
routed in the outermost channel, so several of them nest around the page's
margin, and they are what both measures see. That is the engine's long-edge
placement, not a face this renderer chooses, and it is the same fan TASK-239
(the departing trunk) and the unowned converging fan on a shared dependency
are about. When a long skip no longer takes a lap, re-measure the system map;
if it comes inside a strand of 0.75, two routes per corridor and 400 units of
shared corridor, those become the thresholds and the fixture is held to them.

### Measured and not kept

`elk.spacing.edgeEdge` and `edgeEdgeBetweenLayers` from 20 to 36, so that
parallel routes are drawn apart and a badge has room between them. On the
fixtures it reads like a triumph — flask-map-2's label reach 1181 to 239, its
shared corridor 829 to 0, flask-map-1's 225 to 0, Archboard server's 382 to 12 —
and it is mostly the measure being fooled: 36 apart is beyond the 24 the
corridor measure calls side by side, so a corridor of the same routes stops
counting. The board that matters got worse: the system map's reading flips,
its page goes 2859x2161 to 3625x1753, its fit 0.42 to 0.35, its label reach
1519 to 2145 and its shared corridor 1390 to 2602. flask-map-2 loses fit 0.44
to 0.35 and flask-map-1 0.50 to 0.46. Reverted. The lesson is about the
measure as much as the spacing: `SIDE_BY_SIDE` has to be re-derived from the
drawn separations whenever the engine's edge spacing changes, or a spacing
bump silently empties the column.

## 26. A pair crossing a frame boundary (2026-09-17, TASK-258)

TASK-256.11 seated relationships that share both endpoints apart, so a pair
between two cards at one level draws straight. A pair whose ends sit at
different containment levels still met twice, and the lever it reached for —
the index on the frame's boundary port — does nothing. Measured here, on the
pair from the S08 evaluation with its emitting method inside a `Flask app`
frame:

- **The engine ignores `elk.port.index` on a boundary port.** The seat, the
  seat negated, and ten times the seat all draw the same picture as index 0,
  byte for byte. So does reversing the order the boundary ports are pushed
  onto the frame. Only the port's **face** is the renderer's.
- **The crossings of one face are seated in the order the engine walks the
  source's face.** With the pair leaving a card's south face, whose ports the
  engine walks from the far end, the route departing at the larger coordinate
  across the reading turns first and takes the nearest lane. That is the
  reverse of the order the pair must turn in, so down the flank a crossing has
  taken since section 11 — the beside flank, with a title on top — the two
  horizontal runs are always in the wrong order and always meet.
- **Seating the ends the other way only mirrors the drawing.** The lane order
  follows the end seating, so both seatings draw the same two crossings with
  the labels swapped. Page, route length and bends are identical.
- **A port-less edge across a hierarchy is still refused** (section 10): the
  engine answers `UnsupportedConfigurationException: no entry found for key`,
  so leaving the crossing to the router is not available.

What landed: a relationship that shares both endpoints with another crosses a
frame **by the face it is already travelling**, instead of turning to bundle
down a flank of the frame and turning back. A route out of a frame then
descends straight through the frame's foot and the pair cannot meet. Where
the face it travels is the frame's title band — a route _into_ a frame with
the title on top — it bundles as before, but down the **far** flank rather
than the near one, that being the flank whose seating agrees with the order a
reader follows. With the title on the left the two are the same flank and the
choice does not arise. Both halves are measured clear.

The rule is asked only of a relationship with a sister, so `seat.shared` is 1
everywhere else and every other crossing takes the flank it always has. Twice
over: with that flag false, `crossingFace` is the exact lookup table it
replaces over all eight header-and-face combinations; and no fixture, vault
board, variant or view holds two relationships sharing a pair of endpoints, so
the flag is never true. All four fixtures and every variant of all fifteen
vault boards measure unchanged, measure by measure, against a run of the tree
before the change.

The pair, a triple, both edge orders, both themes, five shapes, under each of
the four flank rules and each reading. Fit is not the column here: every one of
these shapes fits the reference pane whole, before and after, so fit is 1.00
throughout and the page is what moves.

| shape              | page before | page after | crossings before | after |
| ------------------ | ----------- | ---------- | ---------------: | ----: |
| at one level       | 308x310     | 308x310    |                0 |     0 |
| out of a frame     | 601x572     | 404x443    |                1 |     0 |
| into a frame       | 621x573     | 601x572    |                1 |     0 |
| between two frames | 448x889     | 649x760    |                1 |     0 |
| out of two frames  | 745x889     | 500x587    |                1 |     0 |

One of the five buys the crossing with page: between two frames the drawing
goes 201 wider and 129 shorter, a quarter more area, because the pair enters
the target's frame down its far flank instead of cutting the near one. That is
the trade the rule makes, and only a board with a pair ever makes it.

### Measured and not kept

**Every crossing by the face it travels, not only a pair's.** The same rule
asked of every relationship is a wash at best and a loss where it matters:
Codex session's fit 0.60 to 0.66 and Browser application's 0.57 to 0.63 and
its crossings 6 to 4, against **Agent workbench's fit 0.47 to 0.40**, its
shared corridor 374 to 1367 and its label reach 234 to 517, and Board viewer's
label strand 0.85 to 1.14, past the 1.0 the suite holds. The bundle down a
frame's edge earns its keep on a board with several crossings; it only fails
a pair.

**A pair into a frame crossing by the frame's top.** It draws the best
picture of all — two straight descents, 404x498 against 601x572 — and runs
both routes through the frame's own title: with a title of any length the
lines cross the words, and every one crosses the rule under them. Section 11
decided a crossing never runs across a title, and this does not change that.

## 27. A frame crossed both ways (2026-09-18, TASK-265)

Section 26 gave a relationship with a sister the face it travels for a
crossing. A frame crossed that way **and** down a flank by something else is
one the engine can refuse outright:
`UnsupportedConfigurationException: Expected 1 hierarchical ports, but found
only 0`, thrown from `LayerSweepCrossingMinimizer` while it sweeps into the
frame, and the whole board draws nothing. It cost two runs of the 2026-09-18
evaluation batch their picture.

### What is refused

Measured on the graph the renderer builds for the shape the owner now holds
— `WSGI server` into a `Flask app` frame, the framed method with a sibling
inside it and a pair out to `Metrics extension`, under the first flank rule
with the title on top — with the pair's shared corridor split back into a
port each, and nothing changed but the `elk.port.side` of the frame's three
boundary ports. Sixty-four combinations of the tuple (the route in, the
pair's first relationship, its second), on the candidate that reserves a
label for both of the pair:

| tuple              | answer                        |
| ------------------ | ----------------------------- |
| NORTH, NORTH, WEST | Expected 1 hierarchical ports |
| NORTH, NORTH, EAST | Expected 1 hierarchical ports |
| NORTH, WEST, NORTH | Expected 1 hierarchical ports |
| NORTH, EAST, NORTH | Expected 1 hierarchical ports |
| WEST, SOUTH, SOUTH | Expected 1 hierarchical ports |
| EAST, SOUTH, SOUTH | Expected 1 hierarchical ports |

The other fifty-eight are laid out. Reading them:

- **Six rows, four configurations.** The two rows of each `NORTH` pair are
  one picture with the pair's two relationships named the other way round.
  Which is which is not a property of the graph: what the engine answers to
  is **which sister it seats first along the source's face**, and that is an
  outcome of the solve. Stated by geometry rather than by name, a frame is
  refused when the route in is on NORTH, the sister seated first is on NORTH
  and the other sister is on either flank; and when the route in is on
  either flank and both sisters are on SOUTH. Everything else is laid out,
  all three on one flow face and all three on flanks included.
- **It is the assignment, not the faces.** `SOUTH, SOUTH, WEST` and
  `SOUTH, WEST, SOUTH` are both accepted while `WEST, SOUTH, SOUTH` is
  refused, though the three hold the same faces between them. No rule
  counting a frame's ports can state the condition, and none is claimed
  here.
- **Which flank makes no difference.** `WEST, SOUTH, SOUTH` and
  `EAST, SOUTH, SOUTH` refuse alike, so the far flank section 26 keeps for a
  pair into a frame does not rescue this.
- **The order the ports are listed in makes no difference.** The same rows
  refuse with the pair's two ports pushed onto the frame either way round.
- **The candidate moves both the rows and the count.** One render settles
  several candidate drawings and solves each: three distinct graphs on this
  board, and within one of them a candidate per label reservation. Swept
  across them, the four rows naming one sister on NORTH or both on SOUTH
  refuse in every candidate; the two `NORTH, NORTH, flank` rows refuse only
  where both of the pair reserve a label, which is the same picture again,
  a label dummy having moved which sister is seated first. The count follows
  the candidate too: `Expected 2 hierarchical ports` on the NORTH rows with
  no label reserved, `Expected 1` throughout once one is. So the table is
  one candidate; the four are what this shape refuses however it is drawn;
  and none of it is a predicate to test a frame against.
- **The engine is right to refuse.** It expects the dummies in the frame's
  own first and last layers to be accounted for by the frame's ports on that
  one side; a flank port is on neither. The Rust engine panics where
  upstream ELK throws, from the same function.

### What landed

Such a frame is crossed straight through **once per face**: the routes sharing
a face there share the corridor. One port is never two on one face, so the
configuration above is unreachable, and a frame nothing bundles down keeps a
port per crossing, so every drawing section 26 measured is unchanged.

The trigger is deliberately wider than the table: a frame is treated as
crowded as soon as it carries both a flank crossing and a straight one, which
collapses some crossings the engine would have accepted separately. That is
the price of not owning a predicate the engine does not publish.

Sharing a corridor draws the sharers through one point, and the engine then
draws them along one line on the way in or out: 84 units of one ink for the
pair on the first preserved board, 418 on the second — a third of its page,
where a reader saw a single line with a jog at each end. So a run two routes
are drawn on top of each other along is **fanned apart** after the routes are
placed and before they are rounded (`shared-runs.ts`), each onto its own lane
at the engine's own parallel spacing, each keeping the side it approached from,
and stepping out a lane again where another route is already drawn along the
one it asked for. Every board in the tree measures zero overdrawn ink after
it, the two preserved ones among them, and none of them gains a route through
a card. A corridor is then what
it always was — two lines a reader counts across — and never one line standing
for two relationships.

Two unrelated pairs leaving one crowded frame share that frame's corridor too,
and a reader sees four lines converging on one point and fanning out again,
not four lines through one point.

### Measured and not kept

**The frame rule outranking the sister rule.** Bundling the pair back down a
flank draws it crossing itself: down the near flank as section 26 measured,
and down the far flank too, which this task measured and the owner caught.
No flank keeps the order of a pair leaving a frame.

**Letting the route that bundles cross straight instead.** For a route _into_
a frame the face it travels is the header face, and section 11 decided a
crossing never runs across a title. That is why the route in is on a flank at
all, and why the two kinds of crossing cannot simply be made one.

## 28. Every variant is laid out fresh (2026-09-19, TASK-276)

The migrated infrastructure boards exposed the cost of preserving placement:
large empty frames, old cards separated from new branches, and routes that
crossed much of the page to reach their neighbors. A seven-node reproduction
with one edge drew twelve bends. Preserving the predecessor's expanded frame
sizes accounted for some empty space; freeing those sizes alone left the long
routes. Relaxing individual interactive placement strategies either left the
large diagrams or broke the remaining placement assumptions.

The user chose fresh layout, with Standing and transitions carrying the change
story ([ADR 0032](../adr/0032-every-variant-is-laid-out-fresh.md)). The renderer
now has one architecture layout path. It receives the comparison's subjects
(including visible removals), measures their current words and chooses their
reading, flank rule and geometry afresh. No ancestor picture, allocated frame
size, port offset, route or reserved lane is an input. The viewer already pairs
subjects by semantic identity and interpolates their boxes and routes.

Measured through `renderBoard` on all eight migrated families, using their
unchanged vocabulary and content. This isolates removal of predecessor geometry,
before the container packing changes below. These are the nine drafts; the eight
root variants retain exactly the same dimensions at this stage. Fit uses the
reference-pane measure; bend counts are per route.

| Board / proposal                                                       | Size before → after   | Fit before → after | Bends before → after |
| ---------------------------------------------------------------------- | --------------------- | ------------------ | -------------------- |
| platform-migration / strangler-foundation                              | 4744×2759 → 4572×1657 | 0.268 → 0.278      | 5.33 → 1.67          |
| platform-prod-kubernetes-runtime / deterministic-portable-target       | 3113×1554 → 3217×1125 | 0.409 → 0.395      | 1.50 → 1.10          |
| current-cloud-infrastructure / mtls-strangler                          | 5588×9045 → 4755×2143 | 0.099 → 0.268      | 6.44 → 0.89          |
| current-cloud-infrastructure / platform-strangler                      | 5685×8110 → 4692×1756 | 0.111 → 0.271      | 6.00 → 0.62          |
| platform-prod-azure-infrastructure / deterministic-portable-target     | 1237×1330 → 1212×1026 | 0.676 → 0.876      | 0.00 → 0.00          |
| common-weblib / public-api-independent                                 | 3032×3272 → 1912×2375 | 0.275 → 0.379      | 3.94 → 2.00          |
| platform-production-technology-choices / deterministic-portable-target | 2022×2193 → 2367×1622 | 0.410 → 0.537      | 1.94 → 0.25          |
| platform-cluster / device-trust-azure-postgresql                       | 3717×5993 → 3475×4188 | 0.150 → 0.215      | 7.37 → 3.90          |
| platform-cluster / device-trust-cloudnativepg                          | 4104×5971 → 4964×4511 | 0.151 → 0.199      | 6.70 → 3.10          |

Every draft uses less page area and eight fit better. The runtime draft trades
0.014 fit for a shorter page and fewer bends. Deeply nested cluster proposals
still need substantial space; fresh layout removes historical reservations,
not the cost of drawing their actual containment and relationships.

The board-boundary regression compares a nested proposal's atlas and dimensions
with a fresh drawing of its content, and verifies its Standing map. Existing
comparison owners retain removal and identity coverage; transition owners
verify arbitrary card movement, route changes and exact final pictures. Tests
whose only contract was retaining old positions, faces or allocated sizes are
retired with that mechanism.

The named-view sweep covers 90 variant/view pairs (84 nonempty). It also exposed
one reserved label extending two pixels into a rounded corner. Rounding now
caps that corner's radius against its own reserved label footprint, keeping
the engine's straight label run intact without increasing layout spacing. The
focused fixture in `reserved-label-corner.json` owns that regression. All named
views now have zero routes through cards and zero labels off their straight
runs. Ordinary route crossings remain, and are drawn with bridges.

The whole-board sweep exposed a second label failure: separating shared route
segments moved their lines but left the engine's reserved labels behind. Labels
now follow their segment, and the existing lane allocator checks label footprints
when finding a clear lane. Moving the label by the original fixed offset alone
covered neighboring routes. `reserved-label-lane.json` preserves that failure;
its owner checks straight-run attachment, card/label overlap and unrelated route
coverage. The two label fixes retain one routing pipeline.

## 29. Pack independent cards and use equal container insets (2026-09-19, TASK-276)

Fresh layout still drew a ten-application pool as one extremely wide row. Its
children had no relationships, but the compound layered solve stretched the
frame and left 132 pixels below the cards despite requesting only 48. Changing
the inset alone could not remove that extra space.

Frames containing only independent leaf cards now use the engine's rectangle
packing algorithm with separate child layout. The existing reference-pane
aspect ratio supplies the packing shape, transposed for a horizontal reading.
The engine still owns all coordinates. A relationship touching a child or a
nested frame keeps the compound router in charge.

Side and bottom insets are 24 pixels; the measured title band and its existing
air are unchanged. Independent cards use that same gap between cards. The
actual ten-card pool changes from 4144×340 to 752×680, with 24 pixels on each
side and below its grid. Connected frames may need additional space for route
segments and labels. The renderer does not crop those routes to force a box to
look padded equally.

The compound engine also applies between-layer route spacing to invisible
boundary-port nodes. Letting the longest label's global allowance inflate those
nodes added empty side and bottom space. Leaf collections without inter-child
relationships now retain the normal 20-pixel route spacing inside their frame;
they have no inter-card label layers needing the larger allowance. Applying that
change to every frame regressed an existing workbench fixture, so frames with
internal relationships retain their label-driven routing space.

`container-packing.test.ts` verifies small and large collections in both reading
directions: multiple rows and columns for the large collection, equal compact
side/bottom insets, and the unchanged header space.

With fresh layout, label clearance and packing together, the cloud mtls proposal
is 3054×2587 (fit 0.348, originally 0.099) and the platform proposal is 2892×2397
(fit 0.375, originally 0.111). The observed cloud architecture is also narrower:
4780×1843 becomes 3229×2190, improving fit from 0.266 to 0.394. The connected
Windows frame's blank bottom margin shrinks from 103 to 45 pixels, leaving the
24-pixel inset plus normal route spacing. All 17 whole
variants and 90 named-view pairs (84 nonempty) have zero routes through cards,
off-run labels, overlapping labels/cards or labels covering unrelated routes.

## 30. Delete forced outgoing flank routing (2026-09-19, TASK-276)

The user then identified database targets drawn far left of their callers'
Windows VM frame, with long horizontal routes across an otherwise empty page,
and explicitly asked to delete the rule responsible. The minimal reproduction
has three nodes: a frame, its child and an external target. The ordinary
cross-frame route was redirected to the frame's left flank even though its
source faced down. Removing that redirection aligns the target beneath the
frame. Title-band protection remains separate.

The deletion exposed coupled engine workarounds. Native compound routing could
not replace the explicit boundary sections: the three-node reproduction failed
inside the engine. With explicit sections, the top-down hierarchy crossing
sweep refused mixed side/forward ports. Bottom-up hierarchy ordering solves
those crossings, but the old shared-corridor boundary ports then produced
invalid geometry. Those shared ports are also deleted: each crossing now owns
its port. There is no alternate forced-flank path.

Candidate selection also now respects the already-tested label-reach limit.
A mirrored candidate for Board viewer left a label at strand 1.139 despite
other existing candidates satisfying the limit of 1. The chosen alternative
has strand 0.637. The limit is unchanged; selecting a smaller picture cannot
justify a label outside the existing readability contract.

Deleting the routing policy is an explicit product choice, not an improvement
on every historical metric. Two recorded fixture scorecards are updated while
their card clearance, straight-run labels, label-reach and bend bounds remain:

| Fixture         | Fit before → after | Area (Mpx) before → after | Bends/route before → after | Crossings before → after |
| --------------- | ------------------ | ------------------------- | -------------------------- | ------------------------ |
| Agent workbench | 0.466 → 0.407      | 4.981 → 4.257             | 1.8 → 2.0                  | 9 → 10                   |
| Board viewer    | 0.444 → 0.413      | 3.075 → 2.988             | 1.111 → 1.889              | 4 → 7                    |

The complete dated [container-rule inventory](container-rules.md) distinguishes
semantic contracts, presentation policies and remaining engine workarounds.

The live cloud board was also edited by its author during this work. Final
verification uses version 12, separately from the earlier measurements above:
the root is 2162×2095, and both database targets start 64 pixels beneath their
VM pool, with centers inside the pool's horizontal span. The final whole-board
and named-view sweeps retain zero card crossings, off-run labels, label/card
overlaps and labels covering unrelated routes.

## 31. Graphviz placement and native obstacle routing (TASK-278)

The user requested adoption of the shared-container-row prototype and explicitly
rejected carrying the old renderer's extra constraints into it. Graphviz now
places measured nodes across semantic clusters; libavoid routes around cards
and complete measured title bands. Ports shared by connection channel replace
private ordered ports. A channel is the relationship kind, comparison standing
and local direction at an endpoint, so opposing or differently marked routes
remain distinct while same-direction, same-standing routes can share a trunk.
There are no boundary sections, flank-policy candidates, endpoint
checkpoints or post-layout lane/jog repairs. Every variant lays out fresh,
always top-to-bottom; the user rejected automatic sideways readings.

Labels first use clear native route runs. A placement reservation does not
itself become a waypoint; only a label that still cannot fit asks for a reserved
straight run. Independent leaf collections retain compact wrapping and the
requested equal 24px side/bottom insets. Semantic identities, containment and
the shared SVG/atlas coordinate contract remain; Standing affects route geometry
only when it needs a distinct channel to stay legible.

The adoption checkpoint at `0f4b55ab` improves the inspected Public API fixture's fit by 84% and reduces route length
by 53%, with 1.56 bends per relationship and four crossings. Broader results are
mixed: total route length falls 43% and crossings fall from 289 to 147 across
24 drawings, while two lose fit and 21 have more bends than the preceding
ELK renderer. No routes cross cards and no labels leave their own route runs.
The full before/after table, reproduction and test-policy changes are in
[the adoption investigation](shared-container-rows.md#production-adoption-shared-ports-and-natural-routes).
[ADR 0033](../adr/0033-graphviz-placement-and-obstacle-routing.md) records the
engine decision; [container-rules.md](container-rules.md) is the current inventory.

## 32. Fixed bend geometry and required arrow approaches (TASK-278)

Ordinary route bends use one `BEND_RADIUS` (8 diagram pixels), without adaptive
minimum/maximum radii. Every target retains `APPROACH_STRAIGHT` (12 pixels),
independent of stroke emphasis. Sequence self-loop corners use the same radius;
crossing bridges retain their separate bridge radius. These distances and the
other tuning values live in `packages/renderer/src/shared/constants/spacing.ts`.

Native solid obstacles reserve the bend plus approach outside each visible card
or title. Inset native pins still attach to the physical border. Placement leaves
an open passage between opposing routing footprints; disconnected collections
retain their configured packing gaps. A connected container's title-to-content
gap accommodates the same physical footprints. Forced label anchors must clear
those footprints and other routes, as ordinary labels already do.

Balanced port candidates check the obstacles actually offered to the router.
Label anchors follow feasible existing runs; a forced waypoint that reveals a
nearby channel can be corrected on its reserved row. A cramped approach near a
card endpoint or external container arrival removes that face from the shared
relationship-channel alternatives
and lets the native router choose another. This search removes one face per solve
and never removes the last alternative. A rejected native alternative retains
the previous complete route set for label settlement; partial routes are never
published. It does not move authored content or alter relationship identities.

Completed routes must fit their fixed bends and full arrow approach. Intermediate
label attempts may be incomplete, but reservation releases and final emission
cannot accept reversed tangents, undersized runs, or labels occupying bends.

## 33. Align routing with reserved labels and container arrivals (TASK-278)

A forced vertical label uses its placed coordinate when no explicit anchor overrides
it. Both endpoint candidates see that same coordinate, so routing does not introduce
a sideways detour solely to reach a label whose position was already reserved.

An ordinary card and an external destination container offer aligned departure
and arrival candidates together. Both candidates pass channel separation and
obstacle checks; the container retains its arrival-face clearance checks and
fallback choices. A fixed proportional frame entry does not force the source
toward a corner when a clear aligned entry is available. Internal container
connections keep their existing meaning.

For a valid route with a forced-label detour, settlement can project the label
onto an existing vertical run or a neighboring channel. It packs nearby labels
together to retain their clearance, then tries the proposal as one complete
reroute. The proposal must preserve placement, fit every bend and arrow approach,
and reduce bends or route length; otherwise the current drawing remains.

After native routing establishes which card ports are actually used, a bounded
refinement preserves those ports and offers clear projections of existing route
runs onto card faces. Unused proportional ports must not reserve space against
these alternatives: only conflicting unused choices are removed. Actual ports
remain separated by relationship kind, standing, and direction. This lets an
existing downward run reach a top face without looping around the card, and lets
reserved labels align without being blocked by ports on unused faces. The native
router still chooses and validates the complete routes; no board-specific pins
or coordinates are stored.

A native run between disjoint card spans remains eligible to carry its label.
Only a newly proposed adjacent channel requires an aligned endpoint; an
existing run has already established its approach through native routing. The
whole drawing still has to pass the existing label and curve-clearance checks.

## 34. Where a render's time goes (2026-09-24, TASK-342)

Measured on the dogfood vault, one cold render of each current variant. The
profile columns come from before this section's changes, run in-process with
one engine so that each stage can be timed. The last two columns run through
the worker pool, as the Archboard server does. Each board's base render ran
next to its after render, on a box shared with other work (load 8 to 17).

| board               | solves | placement | routing | the rest | pool, before | pool, after |
| ------------------- | ------ | --------- | ------- | -------- | ------------ | ----------- |
| Archboard server    | 1310   | 36.0 s    | 451 s   | 20.2 s   | 110.5 s      | 43.4 s      |
| Voice coordinator   | 1051   | 7.9 s     | 14.3 s  | 0.4 s    | 6.0 s        | 2.4 s       |
| Browser application | 418    | 8.1 s     | 9.0 s   | 0.2 s    | 4.2 s        | 2.0 s       |
| Semantic renderer   | 807    | 4.6 s     | 8.6 s   | 0.3 s    | 4.1 s        | 1.5 s       |
| Board viewer        | 241    | 4.0 s     | 6.0 s   | 0.1 s    | 3.2 s        | 1.4 s       |
| Skill evaluation    | 415    | 3.9 s     | 6.4 s   | 0.2 s    | 2.7 s        | 1.7 s       |
| Command interface   | 276    | 3.1 s     | 5.3 s   | 0.2 s    | 2.3 s        | 1.3 s       |
| Board persistence   | 120    | 1.2 s     | 2.7 s   | 0.1 s    | 2.2 s        | 1.0 s       |
| Agent workbench     | 181    | 2.2 s     | 3.3 s   | 0.1 s    | 2.1 s        | 1.0 s       |
| Board rasterizer    | 118    | 0.9 s     | 1.1 s   | 0.1 s    | 1.3 s        | 0.6 s       |

Every other board takes under 0.6 s before and after.

Routing is where the time goes: libavoid's orthogonal router takes 55 to 90% of
every board, Graphviz placement the rest, and measurement, label placement,
crossings and painting stay under 4%. A routed solve runs four or five native
transactions: the router routes the whole scene again for each endpoint face it
rejects as too cramped, and then once more to refine the pins. The nudging
solver inside libavoid signals an unsatisfiable constraint set with a C++
exception, and one slow solve throws 762,356 of them. For each one the
Emscripten glue captured a JavaScript stack trace and decoded the message,
which was half of the solve.

What a board solves: the unfolded reading settles its labels (each reservation
round places and routes the page again, and each forced label can add a reroute
or two), then releases unused reservations in rounds that solve every
candidate. A board whose unfolded reading is taller than the pane then settles
the same way for every column count its bands allow, which is most of Archboard
server's solves: six folded readings, all of which the router refuses in the
end (routes that cannot clear an obstacle, or a fixed bend reversed).

Kept, each leaving all 54 pictures byte-identical (every board whole, every
non-current variant and every view, rendered through a server before and after):

- The patched libavoid glue throws its C++ exceptions with no stack trace and
  decodes the message only when something reads it. The slowest solve fell
  from 7.8 to 4.8 s.
- A release is placed before it is routed. Routing never changes a page's
  size, so a release whose placement gives back no height or area cannot be
  kept and is not routed. Most release candidates stop here; Board viewer
  routes 69 solves instead of 241.
- Placement is solved once for each set of label reservations. Every forced
  label attempt with that set routes the same placement, and the engine takes
  a stage option (`place`, `route`) to answer one half.
- The column-count readings settle side by side instead of one after another,
  and are compared in the same order with the same tightening bound. (Replaced
  on 2026-09-25 by choosing the count on placements, below.)

Measured and not kept, because they change pictures or have not been shown not
to:

- Skipping a column count whose placement with no labels reserved already
  misses the required fit. It changed none of the 54 pictures and brought
  Archboard server from 38 to 14 s, and its other variant from 51 to 5 s, but
  the unreserved placement is not a bound. A settled reading has fitted up to
  13% better than its unreserved placement (Voice coordinator view 0w8KW8AP,
  four columns: 0.405 placed, 0.459 settled), so the rule needs a margin and
  could still drop a winning fold.
- Letting Graphviz skip its orthogonal splines, which nothing reads. It placed
  cards identically in 94% of the vault's 5,239 placements and saved about two thirds of
  placement in-process, but the discarded splines widen Graphviz's bounding
  box, so the page's margin moves: one picture of 54 changed (Board
  persistence variant tVCqUn1A, 18 px narrower). Through the pool the saving
  was lost in the noise, because routing now dominates.
- One queue shared by all pool workers, so a solve never waits behind a long
  one. It was no faster on Archboard server (45.5 s against 37.6 s).

Archboard server still takes 37 to 45 s, so it does not yet lay out in a few
seconds. Its wall time is the sequential chain
of solves in the six-column reading, the one the router refuses last, at 1 to
2 s per routed solve.

### A fixed solve budget (2026-09-25)

The user's budget is under 1 s of layout per board. After the changes above
one picture still ran hundreds of solves (Command interface 202, Browser
application 294, Voice coordinator 702, Archboard server over 1000), each
placement or route 40 to 80 ms. The number of solves is the cost, so two rules
now bound it.

- **The column count is chosen on placements** (`column-readings.ts`). The
  unfolded reading is settled as before. Every column count its bands allow is
  then placed once, with no label reserved and nothing routed, side by side.
  In increasing order, starting from the settled unfolded page, a count
  replaces the page kept so far when its placement fits materially better
  (`WRAP_MIN_FIT_GAIN`), fewer columns winning ties. Only the chosen count is
  settled, and it is kept when its settled drawing still fits materially
  better than the unfolded one; a count the router refuses keeps the unfolded
  reading. Every other count costs one placement instead of its label rounds.
- **Release rounds are capped at three** (`label-reservations.ts`,
  `RELEASE_ROUNDS`). A round tries every unused reservation together, then
  each alone, side by side, and keeps the first that holds; rounds go on while
  one keeps a release. On the vault, settlements keep a release in at most
  three rounds: Browser application, its view D87Mmg83 and Board rasterizer's
  view vAJmBRF7 take three, Skill evaluation two, Voice coordinator and Board
  viewer one. One round moved four pictures (Browser application 2558x1697 to
  2870x1697, which the user rejected: Semantic viewer dropped to the bottom
  left and its trafficked line to Archboard server crossed the whole board);
  two rounds still drew Browser application 2764 wide.

The comparison starts from the settled unfolded page, not from the unfolded
placement. The unfolded placement reserves no label and so fits better than
the settled page (Archboard server 0.51 placed, 0.34 settled); starting from it
lost the fold of Archboard server view FawxUEKE, which main draws folded at
1317x958 and which then drew unfolded at 834x1372. Folding must not be lost,
so the settled start stays, and costs Archboard server one settled fold the
router refuses.

That fold (two columns) is refused by the final clearance check in
`settleReading`: relationship BiJamQt9's route reverses through a fixed bend.
No earlier solve implies the refusal. Clearance problems come and go between
the attempts of one settlement (its first routed attempt fails on xjqxaA6G,
which later attempts route cleanly; BiJamQt9 first fails in the fifth
reservation round), and even a settled drawing that fails could still be
replaced by a release, which is kept only when every route clears. Across
every fixture and vault variant this was the only settlement whose settled
drawing failed. The fold costs 94 routed attempts (15 s of routing across
the pool): 19 sequential attempts over five reservation rounds (2.1 s) and
one release round of 41 releases (1.4 s). The unfolded reading alone takes
109 routed attempts and about 3.9 s, so refusing the fold at once would still
leave Archboard server near 4 s.

With both rules, all 49 dogfood pictures (every board whole and every view,
rendered through a server on a copy of the vault) are byte-identical to main.
First layout in ms, `timing.ts` in-process, two runs each; every other board
and fixture is under 700 ms on both:

| board               | main 6f5f08c7 | budget     |
| ------------------- | ------------- | ---------- |
| Archboard server    | 35752, 32967  | 7852, 7682 |
| Browser application | 1589, 1601    | 1343, 1380 |
| Skill evaluation    | 1007, 998     | 1047, 1058 |
| Board viewer        | 977, 952      | 974, 985   |
| Voice coordinator   | 1835, 1779    | 537, 545   |
| Semantic renderer   | 924, 938      | 369, 368   |
| Archboard           | 820, 763      | 54, 55     |
| Command interface   | 789, 751      | 762, 771   |
| flask-map-2         | 650, 617      | 642, 618   |
| Agent workbench     | 615, 601      | 608, 611   |

Browser application, Skill evaluation and Board viewer are at or over 1 s,
and the release rounds are what they spend: Browser application's three
rounds take 610, 380 and 350 ms, Skill evaluation's third round (which keeps
nothing) 255 ms, and Board viewer's second (keeping nothing) 415 ms. With one
round they took 608, 628 and 542 ms. A round that keeps nothing must still
route every release whose page is smaller to learn that, so it is not free.
Returning a round as soon as the first release in order holds, and stopping
the solves after it, saved nothing measurable (Browser application 1346 to
1319 ms): the kept release is usually late in the order.

## 35. Evened pins, settled both ways (2026-09-26)

libavoid joins the pins of one class to a point at the shape's centre and
charges each pin its distance from there. On a 340x105 card a side pin starts
about 144 units behind the pin in the middle of the bottom face, which cancels
exactly the shorter run a side exit has along a trunk. So Command interface's
`lifecycle command` dropped out of Contract execution's bottom and ran under the
trunk its siblings leave along, and all six drops hopped it; Skill evaluation's
`One author run` drew 10 crossings the same way. Each pin now carries a
connection cost that makes every pin of a shape cost the same
(`even-pins.ts`, `centreHandicap`), and routes compete on their own length and
bends.

Evened pins move routes, so they move which labels are reserved and the
placement those reservations buy. Applied everywhere they took dogfood from 218
to 190 crossings but Browser application from 15 to 24: no release of its
reserved rows kept its crossings down (the release of `md5cpNZV` came to 27
against 26), so it stayed 2734 wide instead of settling to 2156. Choosing pins
per routing pass by crossings did worse (202; Semantic renderer 7 to 15), since
every pass still reshuffles the reservations. Each reading is therefore settled
with plain and with evened pins, and the tidier drawing is kept: fewer
crossings as a reader sees them (`crossingsOf`), then fewer bends, then less
line. (Superseded by section 38: both settlements are finished first, and the
tidier may have no more of any defect a reader sees.)

On the two galleries, no drawing gains a crossing:

| vault   | crossings | length          | bends       | short jogs |
| ------- | --------- | --------------- | ----------- | ---------- |
| dogfood | 218 → 171 | 372.5k → 363.9k | 2235 → 2079 | 148 → 107  |
| work    | 35 → 26   | 95.6k → 90.4k   | 576 → 505   | 26 → 19    |

Settling twice doubles a reading's label rounds. Archboard server's whole
drawing then runs past the 20 s budget of its wide-boards test on a loaded
machine; making it fast is the next step, not a reason to keep the crossings.

## 36. Lines keep off frame walls, as a finishing step (2026-09-26)

A frame is drawn `CONTAINER_INSET` (20) around its cards, and a card's routing
box reaches `CARD_ROUTE_CLEARANCE` (20) out from it, so for every card on a
frame's west, east or south inset the routing-box edge is the wall. libavoid
builds its channels on those edges and ran lines exactly on the wall, where the
frame edge takes the line's colour: Auditlog's `filter, sort, paginate` down
Portal API's left wall, and Board viewer's `semantic read routes` 1 px inside
Semantic viewer's right wall, in the 2 px passage between Picture cache and
Archboard server, which Graphviz keeps only the cluster margin outside the frame.

A card facing a wall to clear reaches further out (`frame-walls.ts`), so its
routing box ends `WALL_CLEARANCE` (half a lane) beyond the wall, within half
the free passage in front of it. (Since section 38 it reaches a whole lane
beyond the wall where the passage has room.) A passage too narrow to hold a line even half
a clearance off the wall is closed instead, which sends Board viewer's line into
Archboard server's top.

Routed that way from the start, the reach moved which labels were reserved and
so the placement: Agent workbench went from 15 to 18 crossings and Board
rasterizer from 2777 to 3495 wide. It is therefore a finishing step
(`finishing.ts`). After a reading is settled, and plain or evened pins
chosen, the walls that lines run along without staying inside that frame are
named, and the same placement with the same reservations is routed once more
clear of them. That drawing is kept only when it has fewer such lines, every
label still finds a box, it has no more crossings, no line has more bends, and
no line leaves a frame it stayed inside. (Section 38 states the terms every
finishing pass is now kept on.) A relationship within a frame stays
inside even on its wall (`containment-calls.test.ts`), since its cards leave no
lane inside: Board viewer's `Drive walkthrough focus` line keeps to the wall.

Only the two drawings with such a line change; totals are otherwise equal:

| vault   | crossings | length          | bends       | lines on a wall |
| ------- | --------- | --------------- | ----------- | --------------- |
| dogfood | 171 → 171 | 363.9k → 364.0k | 2079 → 2077 | 2 → 1           |
| work    | 26 → 26   | 90.4k → 90.4k   | 505 → 505   | 1 → 0           |

## 37. A line that hooks past a corner enters the face it passed (2026-09-26)

A line from a card up and off to the side dropped down the gutter beside its
target, a card clearance outside it, past the target's top corner, and turned
into the target's side a few points below: Renderer layout's `measure every
word`, Codex session's `decode parameters and answer`, the Kubernetes runtime's
`export request`. The top face's only pin was its channel's seed, often 170
points along the face, and the refinement offers a rail only for a run that
already lies over the face, so the router took the side. The refinement now
also offers, for a route that hooks past a corner, the top or bottom face 12
points inside that corner (20 since, clear of a proposal's change badge) (`pin-feedback.ts`, `cornerPin`), and libavoid still
chooses by cost.

Offered in every routing pass, corner pins moved reservations and placements
as the wall clearance did (section 36): dogfood went from 171 to 187 crossings,
Browser application's `Working with an agent` from 0 to 4. So they are the
second finishing pass: a settled drawing with a line that hooks into a card's
side is routed once more with corner pins, and kept on the same terms.
Renderer layout keeps its hooks: its rerouted drawing gives `fold into the
chosen columns` five bends and leaves its label without a run.

No drawing's crossings change and no placement moves:

| vault   | crossings | length          | bends       | side hooks |
| ------- | --------- | --------------- | ----------- | ---------- |
| dogfood | 171 → 171 | 364.0k → 362.2k | 2077 → 1994 | 181 → 140  |
| work    | 26 → 26   | 90.4k → 89.6k   | 505 → 469   | 33 → 15    |

## 38. No settlement or pass may bring a defect a reader sees (2026-09-26)

Ranked on crossings alone, with two unrelated lines on one stroke counted as a
crossing, evened pins kept Command interface's whole drawing with a 450 px
trunk of two unrelated lines (`the stated board, doing and version` and
`validated input`, 1.6 px apart) for the crossings it saved, on a page 14%
larger. And the finishing passes refused only a new defect of their own kind,
so Voice coordinator's hook pass cured hooks by crowding a label.

Three rules now hold every choice between drawings:

- **A settlement may have no more of any defect a reader sees**
  (`even-pins.ts`, `defectsIn`): drawn crossings; pairs of lines a reader
  takes for one — unrelated lines on one stroke, unrelated lines side by side
  within half a lane, and lines whose corner lies within half a lane of the
  other's stroke, which now includes two lines from one card that turn head
  to head (Auditlog's `ApplyOffsets` and `filter, sort, paginate`) but not a
  line branching off a trunk it shares; the lanes' worth of line drawn on one
  stroke; and line ends hooking into a card's side. Among drawings that pass,
  the one with fewer of these together, ports beside a card's corner counted
  too (IIS Ingress Migration's `US steering`), is kept, then fewer line ends
  across the reading direction, fewer bends and less line. The growth bound of
  section 35 applies per defect saved.
- **Plain and evened settlements are each finished before one is chosen**
  (`compound.ts`). Finishing only the chosen one left the other no chance to
  cure its hooks and trunks: Skill evaluation kept nine hooks, Renderer layout
  five.
- **A finishing pass brings no defect of any kind** (`finishing.ts`, `cures`),
  a crowded label, a touch and a double track included.

The reserved-label clearance (`label-clearance.ts`) is judged the same way: the
cleared drawing is kept when it crowds no more labels and is tidier, each
label it clears counted as a defect saved; its placement may differ from the
ordinary one. Held to the ordinary placement, What the CLI can be asked kept 10
crossings and a trunk where the cleared placement draws 4 and none.

A line out of a frame keeps a whole lane from the wall where the passage has
room (`frame-walls.ts`); at half a lane, Auditlog's `2 - One timestamp type`
still traced Portal API's outline.

Against the merge base `d8fd1bb7` (crossings, stacks of unrelated lines and
their length, lines that touch, hooks into a card's side, ports within 16 px of
a corner, labels within 12 px of another line):

| vault   | crossings | stacks (length)     | touches | hooks    | corner ports | crowded labels |
| ------- | --------- | ------------------- | ------- | -------- | ------------ | -------------- |
| dogfood | 212 → 191 | 22 (2318) → 6 (860) | 12 → 16 | 144 → 64 | 54 → 46      | 21 → 15        |
| work    | 35 → 33   | 2 (76) → 0          | 3 → 1   | 29 → 11  | 20 → 13      | 4 → 3          |

The touches counted here are a looser review measure (two bends within 11 px
of lines that share no end); the dogfood rise is Skill evaluation's fan of five
lines leaving Author run on one trunk. Six drawings draw a crossing or two more
than the base, each where a stack of unrelated lines that hid a crossing is
parted (Agent workbench, Archboard server, Board persistence, Recording a
walkthrough, Skill evaluation, Platform Phone API).

## 39. Fans keep their branches apart, lines keep off corners and standing pins (2026-09-27)

Round 3 of the Graphviz pass left four drawings reading worse than the merge
base `d8fd1bb7`, and some of its rules owned by no test.

- **Crowded joins count as a defect** (`stacked-runs.ts`, `crowdedJoinCount`;
  `junctions.ts`, `crowdedJoins`). Two joins on one lane nearer than the
  nudging distance run into one blot of junction marks. Evened pins moved Skill
  evaluation's fan of six lines out of Author run to a port 15 px from the
  card's corner, branching 9 px apart; the settlement chooser's veto and the
  finishing passes now count such pairs, so the plain settlement, which keeps
  the base's fan and the base's `fill the bare cache`, is kept. They are
  counted rather than named, as is every lane's worth of line two unrelated
  lines share a stroke over: keyed by their pair alone, two stacks of the same
  two lines were one defect, so parting one cured nothing.
- **A standing pin keeps lines a lane off** (`pin-feedback.ts`). The node
  standings now reach the layout with the relationship ones, and a card that
  wears a pin is marked (`compound-graph.ts`, `PINNED_STANDING`). No aligned pin
  is offered within the pin's reach and a lane of its corner, on the top or
  the left face, and a corner pin on the top stands there: at the 20 px corner
  inset, `adopt a draft` landed 8 px from Adopt's pin.
- **A label moved onto a shared span keeps its line the corner-pin inset from
  each card's corner** (`label-centring.ts`): at the nudging distance, Browser
  application's `start voice` left Agent setup 12 px from its corner.
- **A card inside a frame reaches a lane past a wall however far in it
  stands** (`frame-walls.ts`): the reach was a lane less the distance inside.

Rules that no test owned and no drawing needed alone were removed: finishing's
cure by equal defects and fewer bends, its keep-inside-a-frame check and the
stack pass's excused lines, the chooser's near-tie threshold and second count
of junctions, the label-clearance guard that refused a cleared drawing
crowding more labels (the cured count weighs those labels instead, section
40), the duplicate lone-pin centring in `refinedPins`, and
`EndpointOptions.hold`. Together they change one drawing, the work vault's
`Shared SQL boundary`, which draws 3 crossings instead of 4 and 39 bends
instead of 47; section 40 restores `hold`, since that drawing read worse.

Against the merge base `d8fd1bb7` (crossings, stacks of unrelated lines and
their length, the review touch measure, hooks into a card's side, ports within
16 px of a corner, line ends within 14 px of a standing pin's rim, labels
within 12 px of another line):

| vault   | crossings | stacks (length)     | touches | hooks    | corner ports | by a pin | crowded labels |
| ------- | --------- | ------------------- | ------- | -------- | ------------ | -------- | -------------- |
| dogfood | 212 → 192 | 22 (2318) → 4 (808) | 12 → 4  | 144 → 63 | 54 → 30      | 5 → 2    | 24 → 16        |
| work    | 35 → 32   | 2 (76) → 0          | 3 → 1   | 29 → 11  | 20 → 12      | 0 → 0    | 4 → 4          |

Six drawings draw a crossing or two more than the base, each where a stack of
unrelated lines that hid a crossing is parted (Agent workbench, Archboard
server, Durable write boundary, Recording a walkthrough, Skill evaluation,
Platform Phone API).

## 40. Standing pins cleared card by card, rules owned (2026-09-27)

Round 4's reviews, judged against the merge base `ed9c7d8d`, left two
drawings reading worse and rules no test owned.

- **A centred port keeps its face** (`endpoint-options.ts`, `hold`). Without
  it the work vault's `Shared SQL boundary` traded the centred west port into
  Context factory for the top face's seed, joined another line's trunk, and a
  dotted line crossed 5 px under the join and ran 13 px beside the pink line
  for 165 px. With it the drawing is the base drawing.
- **A finishing pass sends line ends off a card's standing pin**
  (`finishing.ts` pin pass, `pin-feedback.ts` `pinnedEnds` and `seedSlot`). A
  channel's seed is its card-wide slot, so the first of two channels on a
  72 px left face stands 18 px down it, 6 px from the pin's rim. Moving every
  seed from the first solve moved labels and so placements (Renderer layout
  whole went from 0 crossings to 1 and 4 hooks, Board persistence whole from
  18 to 22), so the pass asks, one card at a time on the same placement, for
  the seeds of a card with an end beside its pin to stand clear of it; the
  lines it sends off may take a bend more. Cleared together, Board
  persistence's three cards drew two more crossings for one of them. A corner
  pin seated exactly at the pin's clearance is no longer refused by rounding.
- **Rules without owners.** Every rule round 4's review found a drawing
  depending on now has an owner that fails without it, and the lone-port
  rules it listed as unneeded (the slot check, the refusal of an end run that
  does not turn, the strip clear of other lines) are kept and owned: with
  `hold` back, removing them changes six drawings. Removed as owned by no test
  and needed by no drawing: the settlement veto's stack and double-track pair
  counts, bends in the settlement rank, the wall reach's return for a card
  deep inside its wall, and a straight channel's fallback at the span's ends.
  A fault in settling a folded reading is thrown rather than kept as the
  unfolded one.

Board persistence whole is still laid out mirrored against the base. What
flipped it: the evened settlement of the ordinary routing, `[18, 0, 0, 6]`
against the plain one's `[18, 3, 0, 13]` (crossings, touches and crowded
joins, stacked lanes, hooks), is kept, and its label reservations place the
board anew. Its hook pass is refused: curing its seven hooks at once leaves
two labels no run to sit on. Curing them card by card cures five, the teal
`a migrated document` hook among them, but tried in every drawing it made
Board rasterizer's `One browser, two uses` wind through its frame and ran
two of Agent workbench's lines side by side, so it is not taken. Offering
corner pins only on the hooked cards, rather than on every card, flipped
Command dispatch back to its base stack. The teal line's 12 px double
track beside `migrate only if the lease is free` is the router's nudging
distance; the base draws two such tracks in the same drawing.

Against the merge base `ed9c7d8d` (crossings, stacks of unrelated lines and
their length, the review touch measure, hooks into a card's side, ports within
16 px of a corner, line ends within 14 px of a standing pin's rim, unrelated
lines closer than a lane for 100 px or more, crossings within a lane of a
junction mark):

| vault   | crossings | stacks (length)     | touches | hooks    | corner ports | by a pin | double tracks | crossings at a join |
| ------- | --------- | ------------------- | ------- | -------- | ------------ | -------- | ------------- | ------------------- |
| dogfood | 212 → 192 | 22 (2318) → 4 (808) | 12 → 4  | 144 → 63 | 54 → 30      | 5 → 1    | 9 → 6         | 7 → 7               |
| work    | 35 → 33   | 2 (76) → 0          | 3 → 1   | 29 → 11  | 20 → 13      | 0 → 0    | 1 → 1         | 0 → 0               |

## 41. Stacks counted as crossings, hooks cured card by card (2026-09-27)

Round 5's reviews, judged against `ed9c7d8d`, left Board persistence whole
reading worse at four spots, Board rasterizer whole keeping 704 px of stacked
unrelated lines, and rules no test owned.

- **The settlement veto counts crossings seen** (`even-pins.ts`
  `defectsIn`): a stack of two unrelated lines counts as the crossing it may
  hide, as finishing's `noWorse` already counted it. Board rasterizer whole
  now keeps the evened settlement: both stacks and five hooks gone for two
  more crossings and a page 188 px wider. Command interface whole parts two
  stacks and cures three side hooks.
- **Hooks cured card by card** (`finishing.ts` `askByCard`,
  `route-requests.ts` `cornerCards`): where curing every hook at once is
  not kept, the hook pass tries one card at a time, offering the face a hook
  passed on that card alone and asking again for every card kept before it.
  Board persistence whole goes from 6 hooks to 1 (`adopt a draft` into
  Adopt's top, the teal `a migrated document` into Atomic file
  replacement's top), Skill evaluation whole from 9 to 0, Command
  interface whole from 6 to 1.
- **A defect saved buys two bends** (`even-pins.ts` `BENDS_WORTH`). Cured
  card by card, Board rasterizer's `One browser, two uses` took a
  settlement that saved a crossing and a crowded label for thirteen more
  bends and wound through its frame; a drawing that turns its lines more
  than two bends for each defect it saves is not tidier.
- **The pin pass excuses one bend a pin** (`finishing.ts` `noWorse`): a
  line it sends off a pin may take one bend more for each pin it leaves, as
  the pass clears one card at a time, and no more.
- **Owners.** The pin pass's wiring through the compound layout (a rendered
  proposal, `pinned-side.json`), its accumulated clearance, its top-face
  ends, the label pre-filter a lane past the line, the exemption of two
  lines sharing a card from stacks, and the frame inset in label centring
  each have a test that fails without them. The side-exit span and the wall
  run's lane are stated as part of what those defects are.

Board persistence whole still keeps two of the four spots: the teal line
runs 11 px under `migrate only if the lease is free` for about 330 px, and
`the links out of every board` leaves Vault diagnostics' side with a crossing
20 px from the face. The face pass that would drop it straight is refused:
the routing it asks for hooks `submit transition` and crowds a label.

Against `ed9c7d8d` (the same measures as section 40):

| vault   | crossings | stacks (length) | touches | hooks    | corner ports | by a pin | double tracks | crossings at a join |
| ------- | --------- | --------------- | ------- | -------- | ------------ | -------- | ------------- | ------------------- |
| dogfood | 212 → 192 | 22 (2318) → 0   | 12 → 3  | 144 → 30 | 54 → 33      | 5 → 0    | 9 → 6         | 7 → 6               |
| work    | 35 → 33   | 2 (76) → 0      | 3 → 0   | 29 → 8   | 20 → 13      | 0 → 0    | 1 → 1         | 0 → 0               |

## 42. Crossings on a corner, lines side by side, side exits card by card (2026-09-27)

Round 6's reviews, judged against `ed9c7d8d`, left Agent workbench whole
knotted above Thread link, Board persistence whole reading worse at three
spots, and two rules no test owned.

- **A crossing within a lane of a bend counts twice** (`cornered-crossings.ts`,
  in `even-pins.ts` `crossingsSeen` and as a defect `finishing.ts` `cures`
  counts). Curing Agent workbench's hook into Thread link's side crossed the
  purple line 9.6 px before its bend and a grey line 12.6 px before its own,
  with two grey lines 10 px apart; that cure is now refused, and the drawing
  there is the base's. A crossing a lane from a bend is an ordinary one: the
  base draws two at exactly 16 px in the same place.
- **A settlement may not run more lanes of unrelated lines side by side
  nearer than a lane** (`stacked-runs.ts` `trackedLanes`, in `defectsIn`).
  Board persistence's evened settlement ran its teal `a migrated document`
  11 px from two unrelated lines for 377 px; it now keeps the plain
  settlement, where the teal, `the links out of every board` and `check the
  vault` all read cleanly. The cost is a page as wide as the base's (3781 px
  against the evened 2901), four hooks where the evened settlement had one
  (the base eleven), and Read and validate's two lines leaving its left side
  18 px on one stroke before they part. No other drawing changes. Counted in
  the finishing passes as well, lines side by side refused Archboard
  server's parting of three lines stacked out of one card, and Board
  persistence's hook cures, so they are not.
- **Side exits cured card by card** (`finishing.ts` face pass `askByCard`,
  `route-requests.ts` `centredLines`, `label-centring.ts`): where moving
  every reserved label onto its cards' channel is refused, one card's lines'
  labels move alone. Board rasterizer's `One browser, two uses` drops `spawn,
  read the port, stop the group` straight into Chromium executable's top.
  Board persistence's `the links out of every board` is not cured this way:
  its label's row moves other lines into a hook and a crowded label.

Against `ed9c7d8d` (the measures of section 40, and crossings within a lane
of a bend):

| vault   | crossings | stacks (length)    | touches | hooks    | corner ports | by a pin | double tracks | crossings at a join | on a corner |
| ------- | --------- | ------------------ | ------- | -------- | ------------ | -------- | ------------- | ------------------- | ----------- |
| dogfood | 212 → 191 | 22 (2318) → 2 (30) | 12 → 3  | 144 → 33 | 54 → 32      | 5 → 0    | 9 → 4         | 7 → 6               | 43 → 22     |
| work    | 35 → 33   | 2 (76) → 0         | 3 → 0   | 29 → 8   | 20 → 12      | 0 → 0    | 1 → 1         | 0 → 0               | 2 → 1       |

## 43. Lines that meet from apart, one definition of a crossing (2026-09-27)

Round 7's reviews left Board persistence whole with a knot at Former names
and two lines on one stroke out of Read and validate, and two halves of the
corner rule no test owned.

- **Two lines of one card that meet on one stroke from apart are a stack**
  (`stacked-runs.ts` `related`, `ONE_STROKE`). Lines are related, so a
  stroke they share can be their trunk, only where they meet one card at one
  place, within half a lane; runs nearer than 2.5 px, under two ordinary
  lines' widths, are one stroke. Board persistence's `take the new name's
  lease` rode 2.2 px beside the trunk into Former names from a different pin
  of Place the file, and Read and validate's two lines left its side 30 px
  apart and shared 34 px of stroke; both were uncounted and are now a stack
  every chooser sees. No drawing changes: every cure the passes find brings
  another defect. Refusing the trunk its side face draws the knot away, but
  runs `the board the name answers to` 6 px beside `reconcile descendants`
  for 84 px; refusing the grey line its side parts Read and validate's two
  lines, but leaves the grey 12 px from the card's corner. The side-exit pass,
  moving every label onto its channel, cures both but crosses Place the
  file's teal 8 px before its bend and moves labels across the drawing;
  moving Former names' labels alone, it parts Read and validate's lines but
  keeps the knot and sends `reconcile descendants` round into Propagate
  descendant edits' side.
- **One definition of a crossing** (`track/score.ts` `crossingPlaces`):
  every crossing with the two runs it joins; `crossingsOf` counts their
  places and `cornered-crossings.ts` keeps those within a lane of a bend,
  whichever line turns, before or after the crossing, each half owned.
- **The pin pass excuses only the card it tries** (`finishing.ts` `byCard`):
  a line cleared on one card could take a bend more on every later card
  kept. No drawing changes.

Platform Phone API whole keeps round 7's two lines into Database provider's
side: round 6's top entry dropped `create selected context` 4 px beside one
of them and crossed it 4 px from its bend, a crossing drawn with no hop.

The measures against `ed9c7d8d` are section 42's; no count moves. Crossings
drawn with no hop, a line cut beneath another: dogfood 56 → 40 (solid lines
44 → 29), work 12 → 10 (solid 9 → 7).

## 44. A region round one node (2026-09-27)

The user asked that a group spread over several containers draw its region
in each of them (ADR 0038, amended 2026-09-27). A card is now placed with
its first configured group whether or not a sibling shares it, so a
container or the board level holding one member draws a region round that
one card or container: 18 dogfood drawings per engine and 5 of an ingress
board's change.

A region round one node gathers nothing, and laid out as a cluster or a
block of its own it reordered the board's ranks, stood tall sparse bands and
ran lines round them: at `b1f888ca` Recording a walkthrough (Track) bent
22 times where it bent 12, Live server state (Blocks) hopped 9 times where
it hopped 2, and three lines of Starting a workhorse (Blocks) ran through
Thread tools. **Such a region is laid out as its node with a larger box**
(`blocks/lone.ts`): the region's inset round the sides and below, and its
caption band above, so placement and routing see one obstacle where the
board without the region saw one.

- **A card** takes the grown box as its size in every block (`cardAs`).
  Once drawn, the card stands inside it and the region is drawn round it
  (`assembly.ts` `loneRegions`), and a line that stops on the region's wall
  is carried straight on to the card's face (`carriedLine`). The card's
  ports stand on its own face, not the region's (`scene.ts` `cardFace`):
  a port settled against the one card its line runs to spans the card
  (`settle.ts` `lineReach`), and a port moved along the face keeps a
  corner's room from the grown box and stands on the card clear of its
  rounded corner (`jogs.ts` `onFace`). A port moved to close a step takes
  the line that runs straight on through the card from it along
  (`jogs.ts` `throughCard`): the ports of a card laid out as its region
  stand a port's margin in from its own face, where a line planned over
  the grown box does not reach, and moved alone each such port would have
  notched the line through the card. Held there, the line out of Pane
  session in Reading a board (Track) stepped 16 px aside under its region,
  and a line on the ingress board (Track) a point and a half.
  Settled over the region's inset, A
  spoken instruction becomes work (Blocks) stepped a line out of it and for
  that bend kept a port order that turned a container's cards round; moved
  there, a line between two such cards ended past the card's corner.
  Under Track a lane keeps a region's clearance off the grown box, as off a
  region packed whole; under Blocks it keeps a card's, since a block of
  cards is as wide as its Graphviz ranks and the lanes beside a region's
  clearance pushed the next one along its container's wall (Recording a
  walkthrough, `a line parted from another keeps off its container's
  wall`).
- **A container** drawn as a block of its own keeps the region's inset more
  on its sides and below, and its header holds the caption band
  (`place.ts` `insetsOf`, `tree.ts` `add`). Drawn inline, its cluster keeps
  that inset more round it, and its title row as the track scene reads it
  holds the band, so the scene draws the region as the container; the
  container's box is taken back inside it once drawn (`card-layout.ts`
  `read`). Its title row carries the region's inset as its face's, so a
  line into it meets the container, and its walls are fitted both insets
  from what it holds (`sides.ts`), not a container's inset from the
  region's wall, which stood the container 6 px from its card. As a region
  cluster round the frame, the pool of hosts on the ingress board stood
  right of the chain over it and its caption took a band of its own, 120 px
  tall.
- **The caption** stands in the band's top-left corner as every region's
  does, unless a line into the node crosses the band there; then as far
  left as its words stand a lane's room clear of every line, or less where
  the lines leave less (`captionIn`).
- **A caption wider than its node widens the region, not the node**, which
  stands in its middle. A card's grown box is as wide as its caption needs
  (`cardAs`). A container drawn as a block of its own is laid out, and
  where its caption needs the region wider, laid out again with the room
  it lacks added to its sides (`place.ts` `layAll`, `lone.ts` `widened`).
  Drawn inline, its title row stands in its cluster as wide as the caption
  needs beside the insets (`titleWidth`), so Graphviz keeps the room, and
  once its walls are fitted to what it holds, and to the lines that end on
  it, the region widens round it inside that room (`sides.ts` `fitSide`).
  A known limit of Track: Graphviz spreads the ends of lines on the
  container's own wall across the whole title width, so such a container
  grows toward its caption's width and can stand off the region's middle.
  No drawing in either vault has a caption wider than its container.
  A container stood as wide as it was laid out, and a long group name ran
  past the region's walls: a 460 px caption over a region 345 px wide
  (Blocks) and 328 px (Track). No drawing of either vault changes; their
  group names are short.
- **The board decides in the layout it is drawn in**, with its regions
  round one node, under both engines. Decided on the board without them
  and laid out once more with them (`solves.ts`, `6e6dc768` to `2ac99f76`),
  a drawing took one layout more than the board without its regions, and
  its first render 26% to 56% longer: Command interface whole (Blocks) 775
  → 1134 ms. The room such a region takes could turn two of the choices.
  Measured on both vaults, it turns neither. Two heuristics hold that
  outcome; neither guarantees it for another board:
  - **Which ports move to side walls** (`blocks/sides.ts` `facingOf`):
    two blocks stand above one another where they stand apart by no less
    than their regions round one node add to their height (`grownIn`), a
    tolerance counted from the regions, not a comparison with the board
    laid out without them. A block beside
    a column is centred on it, and in Working with an agent (Blocks) the
    region round Pane session stood Voice 16 px up beside the cards over
    Agent: the lines from Application composition into Voice moved to side
    walls, Pane session stood off to the middle and the lines ran round
    Voice. Every other move in both vaults stands its blocks at least
    135 px beside each other.
  - **Which joins part** (`joins.ts` `drawsBetter`): a join kept another way
    is kept only where it draws no more line, as a packing is. With its
    regions, What the CLI can be asked (Blocks) kept the lines into Board
    writes apart for one crossing fewer and drew 18% more line, and Working
    with an agent (Blocks) kept its joins into Agent apart to fit the pane
    better, at a crossing more and 6% more line. No other drawing of either
    vault turns; the guard weighs line length, not the region, so a
    region can still turn a join whose ways draw as much line.
- **No region of a group inside that group's region** (`semantic-board`
  `gatheringGroups`). A container placed with a group stands in its region,
  and so does every member of the group inside it; the members are gathered
  into no second region of the group and keep its colour. The ingress board
  drew one group's region round a pool and again round the pool's four
  hosts.
- **A line runs out and not back** (`jogs.ts` `turnsBack`): in a block of
  cards the Blocks engine lays out, a step to or from a label that turns its
  line back against its last step is closed as a kink is, by moving the
  label or port onto the other end's column, whatever its width. The region
  round Panes in Command interface (Blocks) held 'the stated board, doing
  and version' a lane off its left wall, and the line ran right to its label
  and back 40 px to pass the region. It straightens that drawing and Browser
  application whole (Blocks) and adds no bend or hop to any. Drawn inline, a
  label below a container stands there for the band spacing that keeps it
  off the container's wall, and moved beside the wall it stood the card
  below out past it (`track-placement.test.ts`). Tried in every pass and at
  every step back, it made Archboard server whole (Track) 5% and Board
  persistence (Blocks) 5% slower to lay out, so it is tried once, at labels.
- **A label into a block that packs blocks stays by its source**
  (`inline.ts` `labelHolder`): a region packing two containers draws only
  trunks, and the label of a line into one of them was lost.

Against `67d2f7f8` (visual-polish), over the 46 Track and Blocks drawings
of both vaults that change: hops and bends are as they were or fewer, but
for Working with an agent (Blocks, a hop more where 'start voice' crosses
'controllers over the focused pane's'), Voice coordinator whole (Blocks,
11 → 12 hops and 45 → 47 bends: the region round Workhorse operations
widens it, and 'thread/start with the coordinator body' leaves Coordinator
thread through the gap beside Authored instructions, which steps
'its developer instructions, by digest' 32 px) and Recording a walkthrough
(Blocks, a hop fewer for two bends). Fewer on One command from a pane
(Blocks), Browser application whole and What the CLI can be asked (both
engines) and Command interface whole (Track). Every other drawing reads as it did with
its regions added, each taller by the bands.

The regression fixtures reduced from dogfood boards hold the memberships
the boards hold. One guard is loosened: stacked, One command's `a typed
message` now steps twice, the second time into Codex child beside its
caption where the region round Workhorse queue holds it a region's
clearance off, and the guard still refuses the three turns of the drawing
unstacked (`reading-first.test.ts`). That step reads worse than the straight
line of the drawing without the region: the line passes left of the region
a region's clearance off and enters Codex child right of its caption's
words a lane off, and no column is clear of both.

## 45. The Graphviz engine is removed (2026-09-27)

[ADR 0040](../adr/0040-track-and-blocks-replace-the-graphviz-engine.md) removes
the `graphviz` layout engine. Sections 31 to 43 describe its placement, column
folds, routing, label reservations, settlements and finishing passes; that code
is deleted, and those sections are history. Track and Blocks are the engines,
behind `lib/layout/engines.ts`, and Track is the default. Graphviz still places
the cards for both, and libavoid still routes Blocks' trunks.

Every Track and Blocks drawing of the dogfood vault and of the work vault is
byte-identical before and after the removal.

## 46. As much room under a tab and a nameplate as at the sides (2026-10-06, TASK-420)

The owner saw the first row of cards stand too close under a group's caption
tab, and asked for the same margin there as at the sides and the bottom of the
box. A region keeps 14 px at its sides and below its members, and a container
keeps 20 px. A container's nameplate already kept 20 px over its first row
where nothing ran between, on both engines. A region's tab did not.

Measured on every variant of every board of both review vault copies (the
shop vault and this repository's), from the foot of the tab as drawn to the
top of the first member, where no line turns and no label stands in between:

| Room under the tab or nameplate | Track before | Track after | Blocks before | Blocks after |
| ------------------------------- | ------------ | ----------- | ------------- | ------------ |
| Region round one node, median   | 4            | 14          | 4             | 14           |
| Region, median (min)            | 4 (4)        | 14 (14)     | 4 (4)         | 14 (14)      |
| Container, median (min)         | 20 (20)      | 20 (20)     | 20 (20)       | 20 (20)      |

The cause was in three places, and each is now the same rule: under its
header, a box keeps the inset it keeps at its sides.

- **A region round one node** (`lone.ts` `bandOf`) gave its caption a band of
  the caption and 4 px above and below it, so the card stood 4 px under the
  tab. The band is now the tab, which reaches the caption's foot, and the
  region's inset under it: 10 px taller.
- **A region's header is its tab** (`laid.ts` `tabOf`). A region's block
  ranked its caption as its header, 42 px tall, while the caption is drawn
  4 px down from the region's top. A block of cards then kept 24 px under the
  header (`leaves.ts` `rimOf`, a container's inset and the caption's 4), 20 px
  under the tab; a block of blocks closed its strip to 14 px under the header,
  10 px under the tab. The header is now the caption and the 4 px above it,
  and every block keeps its own side inset under its header: `rimOf`, the
  strip a block of blocks closes (`pack.ts` `closeStrips`) and the channel
  over a folded block's columns (`fold-layout.ts` `headRoom`), which kept the
  24 px of an empty channel. Where a line turns under the header, the channel
  starts at the tab's foot, so such a room is 4 px more than it was.
- **Track's band of captions** (`spacing.ts` `spaceBands`): a channel no line
  crosses under a band of titles kept a container's inset, captions alone
  included. A band of captions alone keeps a region's inset; a band holding a
  title keeps a container's.

`REGION_INSET` (14) in `config.ts` replaces five copies of the number
(`place.ts`, `clusters.ts`, `lone.ts`'s `LONE_INSET`, `sides.ts` and
`containers.ts`'s `REGION_BOTTOM`). `CONTAINER_INSET` (20) does not move.

A region packed round containers on Track stood its caption over their title
rows: ranked across clusters, a title nothing held lower shared the header's
rank. Every outermost title is now held below the block's header
(`card-layout.ts` `build`). No board of either vault drew one; the region
test's fixture did.

Some rooms stay larger than the inset where something needs them. On Track
a band's channel spans the board, so a line turning in the same row
elsewhere, a container ending there or a card sharing the caption's band
keeps the room it needs (Archboard server's panes, 108 px). On Blocks the
row of pins over a cluster of a block of blocks keeps an arrowhead's channel
(Board viewer's Semantic viewer, 45 px). No room is smaller than its side
inset.

The drawings, against `d290d63f`: on Track, crossings are as they were
(930), bends 4294 to 4288, and the pages 0.2% larger. On Blocks the 10 px of
a region round one node turns some choices: crossings 2523 to 2528, bends
5288 to 5276, line length 0.5% more. Synchronous checkout in the shop vault
keeps its joins into Checkout API (10 to 12 crossings, 13% more line), and
Archboard server's TASK-373 crosses 3 more lines; Browser application's
TASK-381 and TASK-385.01 each cross one fewer. No card, line or label stands on a tab or a
nameplate that did not before. First renders on Track stay under 1 s in a
warm process (Board viewer TASK-387 at 0.92 s, as before); Blocks is as slow
as it was.

`region-room.test.ts` holds the room under the tab of a region round
several cards, one card, several containers and one container to the inset
below it, on both engines.

## 47. Lines share a lane only when kind, standing, emphasis and traffic match (2026-10-11, TASK-333)

Lines of one kind may share a lane on purpose, and a difference in kind or in
comparison standing already parted them. A difference in emphasis or in
traffic did not: on Codex workhorse One turn three lines of different
emphasis came down one lane into Codex session and forked into arrowheads
that pointed apart. The key a lane is shared under (`trunkKind` in
`track/route.ts`, read by the block tree's ports, trunks and joins) now also
holds the emphasis and whether the line carries traffic. `compoundGraph`
passes both to layout only for Track (`byLook`); Blocks' keys are as they were.

The drawings, 61 of the dogfood vault, rendered against the commit before and
compared byte for byte: on Track 34 changed, and lines that merged into one
arrowhead now end in their own. Total crossings 857 to 836. Every Blocks
drawing is byte-identical.

**Cost, Track.** Three drawings cross many more lines: Archboard server routes, Board
writes (8 to 16, bends per line 2.4 to 2.9, fit 0.66 to 0.62), Board viewer
(172 to 186) and Command interface (28 to 36). Board writes reads worse.
Agent CLI's lines into the region now leave by three ports (hero, normal,
muted). The block tree then puts the region's cards in a new order. Claim
routes moves under Agent CLI, and Browser's line to it crosses every Agent CLI
line. The block tree's port keys give this order, not the router. A split of
only the router's key keeps the old order. But the normal and muted lines into
Live panes then merge into one arrowhead at the face of its region.

**Known gap, Blocks.** The same change on Blocks re-laid 37 of 58 drawings
and 17 read worse (total crossings 2261 to 2654, Command dispatch's fit 0.84
to 0.64): Blocks reads the key for its ports, trunks, joins and exit sides, so
a split key re-orders and re-packs whole boards, and a trunk parted into N
lines crosses what it crossed N times. Splitting only the router's key on
Blocks (leaving its block keys) cost less (crossings up in 4 drawings, 2261 to 2388) but still shares lanes between blocks. Blocks therefore still shares a
lane across lines that differ in emphasis or traffic; `matched-kind-channels.test.ts`
holds the separation on Track only.

## 48. A region faces the walls its lines cross (2026-10-17)

On Device Trust Control Plane, native hosts (Blocks), lines from cards in the
Device Trust Workloads region to cards on its right ran down the region,
along its whole foot and up its far wall. Two causes made these detours.

A label that a join moves to the source's block (`joins.ts`) kept its port on
that block's face, because a line to a wall was not ranked by Graphviz and so
could not carry a label. The line from Local platform operator held its label
in the region, so its port stayed on the region's bottom. Settling stood that
port at the far right of the bottom, and libavoid ran the trunk round the
corner and up the corridor.

A card reached only through a wall forms a Graphviz part of its own, and
Graphviz sets those parts side by side in the board's order. Device CA
certificate state stood at the region's far left, and its line from Device
Identity crossed the region's whole width.

A block can now face its walls (`BlockTree.facing`). A line that carries its
label leaves by the wall through its label, ranked to a stub below it, as a
line from a wall is ranked from a stub above (`labelledOut` in `walls.ts`). An
item whose every line crosses one wall stands toward that wall in the order
Graphviz meets the items (`towardWalls`). Facing changes many boards for the
worse when it is always on: Two doors to a turn crossed 1 line before and 15
after, and Command interface ran its lines some 20000 px further. So facing is
a choice, and only Blocks makes it. A Blocks solve reports whether facing
would change its blocks (`faces`). After the joins choice, `layJoined`
(`joins.ts`) takes the chosen way laid out facing its walls where it reads
better as a way of keeping the joins does (`drawsBetter`). Weighed inside each
solve instead, the shorter faced layout kept the joins choice from a way that
crossed 14 lines fewer. Track never faces its blocks: no Track drawing of
either vault changed when it did.

A line that carries its label to a wall reaches the wall under its label, and
a line from the same card without a label there reaches it under the card. So
a line from the label holder keeps a wall port of its own (`leave` in
`tree.ts`). Sharing one, on Issuance and revocation (Blocks) the line from
Rust device trust library ran down to its label's channel and climbed back
to the port of its card's other line, and looped round the line from Local
platform operator.

The drawings of both vaults (this repository's and one work vault, 7206 Blocks
drawings) were rendered against the commit before and compared byte for byte.
Of this repository's drawings, 32 changed: 29 read better on crossings plus
runs away from their ends at 300 px each, and 1 read worse. Of the work
vault's, 17 changed: 13 read better and 2 worse. The native hosts drawing ran
its lines 6295 px away from their ends before and 2208 after, and drew 30217
px of line before and 25041 after. No Track drawing changed.

**Cost.** A faced solve is one more Blocks solve per board. The joins search
asks for it with every join before its labels at once, and again for each way
it keeps, so it is laid out beside the turns. Over this repository's current
variants, Blocks first renders took 186.0 s before and 186.8 s after (best of
two runs each). Board viewer takes 4 s longer (19.9 s to 23.9 s): the way it
keeps comes last, so its faced solve runs after the turns. Agent workbench
takes 2.6 s less. Track first renders took 16.5 s before and after.

Inside Service certificate rotation (work vault) runs one line further for 4
crossings fewer. Existing ingress ownership stands Test clients beside its
region and draws its line to Legacy IIS origins further. Moves between
pictures (Board viewer, TASK-472.05) crosses 3 lines more for 13% less line.

On a planned board the drawing's body is moved by `translate(16 24)`, which
`bodyShift` in `drawn-routes.ts` did not read. The scorecard then counted a
route 16 px under Local platform operator on Issuance and revocation as
passing through it. Section 49 records the fix.

**Known gap.** A line to a wall still leaves under its card and enters above
its target's label, so it climbs in the corridor beside the region. On native
hosts the line from Device Identity to Device CA certificate state still runs
some 1000 px away from its ends.

## 49. A line round a container counts as a crossing when containers stack (2026-10-17, TASK-486)

TASK-486 wrapped the header of Code evidence (Archboard server, view Code
evidence, Track) to one line. The page stacked under HTTP serving became 83 px
shorter, so it fit the pane better (0.741 to 0.789). Its score, fit less a
share for each crossing, rose from 0.719 to 0.765, above the 0.736 of the page
as Graphviz ranks it. Stacked, the block crossed 1 line, bent 16 times and drew
5043 px of line. As ranked, it crossed 2 lines, bent 14 times and drew 4425 px.
Both picks of the stacking choice now took the stacked page, so the guard did
not weigh its 2 bends and 14% more line. Board writes stood at the far left.
'read a board, write one under its lease' ran over Code evidence and down its
far side, across the whole page.

Treating a near tie on both score and fit as no earlier pick does not work.
Three overviews of the work vault (Track) make the same trade on the block's
numbers. There the stacked page reads clearly better.

The block's reading measures now count one more crossing for each line that
turns round the corner of a container it has no end in (`turnsRoundOf` in
`blocks/weighing.ts`). The line runs over or under the container past one
of its sides. It then runs down or up beside the container for more than 200
px, the length of a lap. Only the stacking choice reads these measures. Code
evidence then ties on crossings, and the page as ranked bends less, so the
containers stand as Graphviz ranks them. The drawing is the one of before
TASK-486, with the shorter header. A tighter rule counted only a run within
200 px of the container's top or foot. With it, What the CLI can be asked
(Track) crossed 13 lines instead of 5.

Over every variant and view of both vaults on both engines, 18 drawings
changed, 13 of them distinct, all on Track. On crossings
plus runs away at 300 px each, 3 read better, 2 worse and 13 the same. The 2
worse ones are Code evidence, which is back to its drawing of before TASK-486.
Device trust design (Device Trust Control Plane) no longer runs two lines
through the header of Device Identity. Shared library coupling (work vault)
crosses as many lines and draws 5% more line. Track first renders took
17.2 s and 17.0 s before, and 17.0 s and 17.1 s after.

`bodyShift` in `tests/drawn-routes.ts` now reads every group that moves the
body: the planned frame's `translate(16 24)` and the canvas shift inside it.
Before, every route of a planned board was compared 16 px left of and 24 px
above where it is drawn. Native hosts (Device Trust Control Plane, Track) then
counted 5 routes through cards. Read where they are drawn, it has none, on
Track or Blocks.

## 50. A decision's answers leave it from separate points (2026-10-17, TASK-491)

On Device Trust Control Plane, the flowchart of "Enroll through the
in-process Rust library" sent both answers of "Which caller drives the
library?" out of the diamond's bottom point, and split them just below it. A
flowchart reads a decision by its answers leaving it apart: one from the left
point, one from the right point, and a third from the bottom point.

Two things put every answer on the bottom point. The track router gives the
lines of one kind that leave one card face one shared port and one trunk
(`channels.ts`), and every line of a flowchart is of one kind. Then
`flowchart-ports.ts` (now `ports.rs` of `crates/archboard-flows`, section 52)
moved that port to the middle of the side it crosses.
Moving the line ends after the layout cannot fix this. An answer whose label
Graphviz stood inside the diamond's width would run back under the diamond.

The layout now places the answers apart:

- The flowchart measures a decision wider than its diamond on either side.
  The extra room is an answer's sideways run (`2 × BEND_RADIUS`) and half the
  widest answer's label. The measure marks the decision `pointed` with that
  half width.
- `compound-graph.ts` gives each line out of a marked card a Graphviz
  compass point: the first answer `sw`, the last `se`, and any other `s`.
  Graphviz then stands each answer's label and step under its corner of the
  box, where its order of the ranks allows.
- Before anything else is routed, `track/points.ts` holds each line down out
  of the card to one point of its bottom edge. The line whose label box or
  card Graphviz stood furthest left goes to the left side, the one furthest
  right to the right side, and any other to the middle. A side line runs
  down half a label in from the box's edge, so its label can stand on it
  inside the box. A held line keeps a port of its own. It shares a trunk
  only with lines held to the same point. Label boxes slide onto its point,
  and no jog closing moves it.
- Once the drawing is laid out, the flowchart cuts the box back to the
  diamond. It draws a side line out of the point on that side: sideways,
  then down where it was laid out (`fromSide`, now `from_side`).

With four or more answers, the middle ones share the bottom point and split
below it. A line up out of a decision is not held.

Without the room for the label, 43 side answers stepped back under the
diamond just below it. The label could not stand on its line where the line
ran down at the edge of the box, because a label slides no further out than
the scene's items reach (`extentOf` in `labels.ts`). Holding Graphviz's first
leg two or four times as heavy did not move those labels.

Every flowchart view of every variant of both vaults was rendered before and
after (1759 drawings of this repository's vault, 114 of a copy of the work
vault) and compared byte for byte. 1759 and 108 of them changed, which are
268 and 87 different pairs of pictures.

| measure (sum over the changed drawings) | dogfood           | work            |
| --------------------------------------- | ----------------- | --------------- |
| lines that start at one point           | 1017 → 64         | 262 → 10        |
| turns                                   | 6768 → 5951       | 1842 → 1520     |
| length of line                          | 1224870 → 1201707 | 315034 → 304965 |
| crossings                               | 20 → 21           | 0 → 0           |
| runs through a step                     | 0 → 0             | 54 → 47         |
| width of the page                       | 244397 → 245950   | 84475 → 84855   |

Of the lines that still start at one point, 35 and 3 pairs are the middle
answers of a decision with four or more answers. The rest start at no
decision's point: they leave a card or a loop, which this change does not
hold.

The first round left three faults. Three drawings crossed one line more: A
tab session ends (Agent workbench), A stop (Codex workhorse) and A spoken
instruction becomes work (Voice coordinator). Six side answers in three
drawings still stepped back under their diamond above their label: Move a
board (Archboard server routes), A reveal (Board viewer) and A board moves to
another vault (Board persistence). In the last one, "unclaimed" ran back under
the whole diamond and round a step. And a label could stand off its line: the
flowchart draws a line into a decision to its top point, and the router had
stood the label on the line where it entered the wider box.

The second round fixes them with four rules:

- The flowchart lays the graph out twice. The first layout holds no answer
  to a point. Graphviz orders each decision's answers there so that the
  fewest lines cross, a loop's line back up included. The second layout
  asks for the points in that order (`inFreeOrder` in `flowchart.ts`, now
  `in_free_order`). If that drawing crosses lines, a third layout asks in
  the board's order, and the drawing that crosses fewer lines wins. Asked for its points, Graphviz
  can still stand the steps against the first layout's order. A stop and A
  tab session ends crossed because the board's order put the step that loops
  back up on the far side.
- `track/points.ts` holds a decision's answers to its points in the order
  that crosses fewest of them on the lanes and cards past their labels. Label
  boxes are left out of that count, because boxes that share a stretch of a
  band trade places (`label-runs.ts`). Where Graphviz stood two answers'
  labels against the order of the steps they reach, the steps decide the
  sides. That is what crossed in A spoken instruction becomes work.
- Of two answers, one whose label or step Graphviz stood past the middle, on
  the far side from its point, leaves from the bottom point. From its side
  point it would run back under the diamond. That is "claimed" in A board
  moves to another vault: a loop's line stands between the diamond's right
  point and the step it reaches.
- A label box on a line from a side point does not stand inward of the
  point (`label-runs.ts`), and it does not settle onto the lane below it
  (`settleOnLanes`). A step that the line must still take goes below the
  label, toward the step it reaches. A line into a decision is held to the
  middle of its top, where the flowchart draws it, so its label stands on
  the line that is drawn.

Every flowchart view of every variant was rendered again: 1759 drawings of
this repository's vault and 114 of a fresh copy of the work vault. Against
the first round, 1482 and 42 drawings changed, which are 206 and 37
different pairs of pictures. Only one of them crosses more lines, runs
through more steps or starts more lines at one point (below).

| measure (sum over every drawing, original → first round → now)  | dogfood            | work               |
| --------------------------------------------------------------- | ------------------ | ------------------ |
| crossings                                                       | 20 → 21 → 14       | 0 → 0 → 0          |
| lines that start at one point                                   | 1017 → 64 → 61     | 262 → 10 → 10      |
| turns                                                           | 6768 → 5951 → 5807 | 1846 → 1522 → 1444 |
| side answers that step back under the diamond above their label | 0 → 6 → 0          | 0 → 0 → 0          |
| labels that stand off their line                                | 246 → 326 → 100    | 0 → 7 → 0          |

The first value of each cell is the renderer before this task, on the same
vaults.
913 answers of this repository's vault and 154 of the work vault leave from
a side point. 67 and 6 of them run back under the diamond below their label,
toward a step that stands under the diamond, as a branch that rejoins the
step after the decision does. Five answers moved from a side point to the
bottom point.

One drawing measures worse: Certificate lifecycle and protected access (work
vault, feat_device-trust-mac-custody). A line runs into the bottom 8 px of
the box the measure gives a card, where it joins the line out of that card.
On the page the join stands under the card, and the drawing turns twice
less. The 100 labels that still stand off their line enter an End terminal,
which the flowchart also draws to its middle. The extra layouts made rendering
the whole corpus take 161 s in place of 155 s.

## 51. The core's router routes the trunks of Blocks (2026-10-25, TASK-520.02)

The renderer core routes the trunks of Blocks with its own orthogonal router
(`crates/archboard-router`), in place of libavoid
([ADR 0057](../adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)).
The router is written from the published papers that its module cites. It
searches a grid of the obstacles' buffer edges with A*, and charges each turn
and each crossing of a route found before it. It then nudges the routes on
one line apart one axis at a time with a separation solver. Routes from one
shared pin run as one line until they part, and routes that share a line
stand in the order in which they part. Where those orders contradict each
other, the surest orders are kept and the rest are dropped, so no order
closes a cycle. Where a channel is too narrow for its lanes, the routes are
nudged again with each pin held only by the stub out of its buffer, and the
answer that crowds fewer routes is kept. On Agent workbench a line whose
segment into its pin, held at the pin, ran 424 px up a corridor left three
other lines the room of one, and they stood 5.8 px apart. A trunk that the
router cannot route still falls back to undirected ends and then to a dogleg
(`trunks.ts`). The router never throws.

All 5,295 trunk scenes that libavoid routed for the corpus were replayed
through the router. Crossings fell from 260,419 to 195,096 (25% fewer), turns
rose from 306,189 to 322,437 (5% more) and the routes are 3% shorter. No
connector was left unrouted, and the replay took 6.5 s.

| drawing, Blocks, one at a time | libavoid | the core's router |
| ------------------------------ | -------- | ----------------- |
| all 293 drawings               | 18.0 s   | 14.4 s            |
| Workspace packages             | 3.0 s    | 0.56 s            |
| One tab session                | 1.1 s    | 0.39 s            |

One drawing takes longer: Agent workbench's Workhorse operations
responsibilities, about 210 ms in place of 150 ms when the board's views are
drawn in order. Alone, each of its seven solves is faster than with libavoid.

On whole boards drawn with their groups, Blocks can choose another packing
with the new routes, and some boards count more crossings than before
(Agent workbench 399 to 565), others fewer (Board persistence 398 to 279).
Over the 23 boards and fixtures, crossings rose from 4,200 to 4,352 (4%),
the page area fell 17%, the route length 8%, and the ink of lines in a
margin lane by more than half.
The user compared every board in dark mode, side by side, and judged the
router's pictures better on all of them. The scorecard weighs crossings
before position, packing, grouping and order, which decide more of how a
board reads, so it was not the judge.

The legacy-routing fixture now stands its chain of cards in line with the
line into the wide pool below it, not over the pool's middle. With libavoid
the slid packing's straight line came back with two turns 5e-14 px apart,
which tied it with the centred packing, and the centred packing won by
order. The router returns the straight line. Both final pictures run straight
into the pool.

The Blocks cases of Browser application and Board viewer no longer need a
test budget of their own: Board viewer, the slowest, takes about 5 s.

## 52. The core lays out sequences and flowcharts (2026-10-25, TASK-520.06)

The renderer core lays out every message sequence and every flowchart
(`crates/archboard-flows`,
[ADR 0057](../adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)).
The rules are the TypeScript rules they replace, ported in the same order of
floating-point operations, so what each rule is for is what the sections above
say. They now live here, in `crates/archboard-flows/src/`:

| rule                                                         | was (`packages/renderer/src/shared/rules/`) | now                       |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------- |
| columns, cards, lifelines and the stack of flows             | `layout/sequence/dataflow.ts`               | `sequence/layout.rs`      |
| a participant's card                                         | `layout/sequence/sequence-card.ts`          | `sequence/card.rs`        |
| a message's words, its note and its pitch                    | `layout/sequence/step-rows.ts`              | `sequence/rows.rs`        |
| every step down the page, and a frame's rows                 | `layout/sequence/step-placing.ts`           | `sequence/placing.rs`     |
| activation bars                                              | `layout/sequence/activations.ts`            | `sequence/activations.rs` |
| a message's ends, its label's plate and its row              | `layout/sequence/messages.ts`               | `sequence/messages.rs`    |
| a decision's or loop's frame                                 | `layout/sequence/frames.ts`                 | `sequence/frames.rs`      |
| the sizes                                                    | `layout/sequence/sequence-design.ts`        | `sequence/design.rs`      |
| what the painter reads, and a picture without its comparison | `render/sequence-picture.ts`, `shownFlows`  | `sequence/mod.rs`         |
| a flow read as a flowchart's graph                           | `flowchart/flowchart-graph.ts`              | `flowchart/graph.rs`      |
| where a line meets a diamond, a hexagon or a terminal        | `flowchart/flowchart-ports.ts`              | `flowchart/ports.rs`      |
| shape sizes, the answers' order, the diamonds                | `flowchart/flowchart.ts`                    | `flowchart/mod.rs`        |

Two route helpers that Track and Blocks still use in TypeScript are copied
into `routes.rs`: `reversed` (`layout/routes/curves.ts`) and `pairCrossings`
(`blocks/tree/joins.ts`). The other curve helpers are the painter's
(`archboard_scene::geometry`).

The host still gives the core what it does not hold. Text widths and line
breaks are the canvas and Pretext of the place that draws (TASK-520.07),
asked through the `Text` trait. A flowchart's graph is laid out by the track
engine (TASK-520.04): the core awaits it through `FlowchartHost::track` up to
three times, as the TypeScript did. A sequence is laid out and painted in one
synchronous call (`drawSequence`), and a flowchart in one asynchronous call
(`drawFlowchart`), so neither drawing crosses back to TypeScript before it is
painted.

Every sequence and flowchart view of every variant of the dogfood vault and
of the vaults under `examples/` was drawn with the TypeScript layout and with
the core, under both engines and both themes, with and without the comparison:
13,364 sequence drawings and 8,852 flowchart drawings, every one the same
bytes. The whole corpus, architecture views included, is 35,560 pictures, and
none of them changed.

The current variants were timed with one job, four runs before and four
after, each drawing at its fastest run. Sequences take 8,795 ms in place of
9,229 ms. Flowcharts take 20,933 ms in place of 20,338 ms, about 0.85 ms more
for each of the 696 drawings. Architecture views, which this change does not
touch, take 12,101 ms in place of 12,062 ms. The flowchart's extra time is the
crossing to the track engine. For each of its two or three layouts, the core
writes the graph as JSON and reads the drawing back as JSON, where the
TypeScript layout handed the engine its own objects. That crossing ends when
the core holds the track engine (TASK-520.04).
