# Container rules — Graphviz adoption

TASK-278 replaces the ELK layout audited below. Spacing and clearance values
are editable in [`config.ts`](../../src/transformers/semantic-renderer/config.ts);
values use diagram pixels, independent of camera zoom. Rebuild the frontend,
restart the canvas at its configured URL, and reload the viewer after editing.
The current rules are:

- Visible semantic children make a node a frame; preserve the parent hierarchy.
- Measure the complete title and reserve its title band. Keep 20px of air
  below it and 20px minimum side/bottom insets around content.
- Use 24px base sibling spacing and 32px between
  ranks. Reserve measured label rows only where needed; do not also expand
  every rank gap by the tallest label.
- Pack disconnected leaf collections into rows. Connected children take part
  in Graphviz's global ranking, including relationships crossing their frame.
- Assign equal-sized leaf peers with the same kind and nonempty responsibility
  on the same fresh row to their slots in authored order, before routing.
  Different roles are not moved just because their dimensions match. No
  predecessor positions, fixed ranks or reserved columns participate.
- An outside caller or dependency may occupy the frame's vertical span.
  A container does not reserve one opaque outer layer for placement. A
  relationship crosses a frame body only when one endpoint belongs to it;
  relationships between outside parts route around the frame.
- A frame's relationship with its own descendant meets its title divider;
  external relationships meet its outline. Incoming frame arrows use a clear
  face with room for their head and bend. Protect complete title bands.
- Route around cards and title bands with libavoid. Relationships with matching
  kind, comparison standing and local direction share ports on each face;
  different channels use distinct attachment positions and lanes.
  Cards and external destination frames with overlapping facing spans offer aligned ports
  at the nearest feasible balanced position. On a face with an unobstructed
  aligned channel, omit the redundant center choice that would introduce a
  detour. Keep other faces available. This applies across
  boards and variants; it uses measured geometry, never board-specific hints.
  The native router chooses among those faces. Relationships
  keep their own identities and labels even when they share a port or trunk.
  The final approach must fit the actual arrowhead and a rounded bend.
- Put labels on clear runs of their own routes. Reserve measured space only
  when ordinary placement cannot fit a label. Placement space does not force
  a route through that box: try natural runs before adding a label waypoint.
  Prefer anchoring a missing label on its existing straight channel and let
  other routes avoid it. Nearby parallel labels may shift their channels
  together within their clear intervals to preserve label spacing. Validate
  the complete proposed reservation set before accepting it; otherwise keep
  the original reservations. Keep labels clear of titles,
  frame outlines, cards and other routes.
- Draw outer frames behind their contents, headings above them, and apply the
  nearest configured container color to descendant borders/tints.

Architecture boards read top-to-bottom and lay every variant out fresh. Long
paths can wrap into adjacent downward columns when the complete routed result
improves pane fit by at least 5%. Whole frames and overlapping rows remain together; side-entry
sources stay with their consumers. Column count is chosen dynamically.
Candidates whose proposed card footprint cannot meet that gain are skipped
before the more expensive label and routing settlement.
The automatic down/right fit comparison was removed after the user rejected
the resulting long horizontal chains. Corner rounding and crossing bridges remain shared drawing operations.

Removed in this adoption: fixed flank policies, synthetic boundary sections
and ports, bottom-up hierarchy ordering, forced forward faces for cross-frame
skips, fixed title detour flanks, folded-layout exceptions, the multiple-flank
scorecard search, and later route fanning/jog repair. Integration-added private
port ordering, pin spreading, endpoint checkpoints, minimum jog/approach rules,
label-axis scoring, and crossing-driven corner compression were also deleted at the user's request. Graphviz places the graph;
libavoid routes it. [ADR 0033](../adr/0033-graphviz-placement-and-obstacle-routing.md)
and [the measured investigation](shared-container-rows.md) record the choice.

## Historical audit before adoption

Requested during TASK-276 after database targets were forced left of their
containing callers. This is a dated inventory of the architecture renderer,
not an additional source of constraints. The code owns the behavior.

## Rules removed in TASK-276

- Predecessor positions, frame sizes, ports and routes no longer constrain a
  proposal. Every variant is laid out fresh (ADR 0032).
- An ordinary outgoing relationship is no longer redirected to the frame's
  left flank. It crosses in its attachment direction unless that would cross
  the title band.
- Mixed side/forward crossings no longer share one synthetic boundary port.
  Each crossing has its own port. This workaround was coupled to the forced
  flank rule.

## Container-specific rules that remain

| Rule                                                                                                                                     | Purpose / judgment                                                                                                                                                           | Code owner                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A node becomes a frame when another visible node names it as its parent. Type and containment are separate.                              | Semantic representation; keep.                                                                                                                                               | `measurement.ts`, `semantic-appearance.ts`, ADR 0025    |
| Preserve the authored parent hierarchy and document order in the engine graph.                                                           | Containment is meaning. Document order also provides deterministic tie-breaking.                                                                                             | `layout/compound-graph.ts` → `containNodes`             |
| Measure the title without truncation; use its measured box as the frame's minimum size.                                                  | Text must fit. Heading measurement uses 20px padding, a 56px text offset, preferred width 260–340px and minimum height 72px.                                                 | `measurement.ts`                                        |
| Reserve the title band plus 24px of air; use 24px on the other sides.                                                                    | Presentation policy, now consistent. Engine routes can require extra space beyond these minimum insets.                                                                      | `layout/compound-graph.ts` → `framePadding`             |
| Pack a collection of independent leaf cards with ELK rectangle packing.                                                                  | Prevents one excessively wide row. Uses the existing reference-pane aspect ratio and 24px card gaps; relationships touching children or nested frames retain layered layout. | `layout/compound-graph.ts` → `configureCollections`     |
| Leaf collections without inter-child relationships use normal 20px routing tracks instead of the global label-driven allowance.          | Engine workaround: invisible boundary-port nodes otherwise inflate empty side/bottom space.                                                                                  | `layout/compound-graph.ts` → `configureCollections`     |
| A frame-to-descendant relationship, or its reverse, attaches along the reading direction.                                                | Distinguishes a container's own call from an external arrival.                                                                                                               | `layout/compound-graph.ts` → `containmentSides`         |
| A frame calling a descendant starts its line at the title divider rather than the outer top edge.                                        | Presentation adjustment after layout; worth keeping distinct from routing constraints.                                                                                       | `layout/compound.ts` → `leaveFromTitle`                 |
| A same-level relationship involving a frame outside its own contents leaves attachment faces to the engine.                              | Workaround for explicit hierarchical frame ports that the engine rejected.                                                                                                   | `layout/compound-graph.ts` → `framesOutside`, `facesOf` |
| Forward skips crossing containment use forward attachment faces.                                                                         | Workaround for unsupported free, port-less hierarchy crossings.                                                                                                              | `layout/compound-graph.ts` → `sidesOf`                  |
| Avoid crossing the title band: ordinary arrivals detour around its near flank; paired relationships use the far flank to preserve order. | Title protection is necessary; the fixed flank choice is an inherited routing policy worth auditing. Outgoing routes are no longer swept into this rule.                     | `layout/reading.ts` → `crossingFace`                    |
| Split a relationship at each crossed frame and connect its sections through explicit boundary ports.                                     | Engine workaround still required: native compound routing failed on a three-node reproduction.                                                                               | `layout/frame-crossings.ts`, `layout/compound-graph.ts` |
| Process hierarchy crossings bottom-up.                                                                                                   | ELK's top-down sweep rejected mixed side/forward ports after the outgoing flank rule was removed. Replaces the coupled forced-face/shared-port workarounds.                  | `layout/compound-graph.ts` → `nodeOf`                   |
| Do not try folded readings when any frame is visible.                                                                                    | Historical ELK failure workaround. Candidate for a fresh engine probe; not a semantic requirement.                                                                           | `layout/reading-choice.ts`                              |
| Labels must clear the title and frame outlines; the frame interior is available. Bridge arcs also avoid title bands.                     | Readability and clearance. A frame is not a solid card obstacle.                                                                                                             | `layout/label-runs.ts`, `layout/crossings.ts`           |
| Draw frames behind routes/cards, outer frames first; draw headings above them and add the title divider.                                 | Visual layering.                                                                                                                                                             | `svg/architecture.ts`, `svg/measured-cards.ts`          |
| A configured frame color supplies descendant border/tint scope; the nearest colored frame wins. Icons retain each node's own type.       | Visual grammar, separate from layout.                                                                                                                                        | `semantic-appearance.ts`, ADR 0025                      |

All code owners above are under `src/transformers/semantic-renderer/lib/`.

## Global rules that also influence containers

- Choose down or right reading, transposing the problem for the rightward solve
  while keeping the visible header on top.
- Derive dependency ranks, break cycles in document order, and choose endpoint
  faces and port order from ranks and a flank policy.
- Try multiple flank policies. Compare candidates using fit, area, card share,
  route length, bends, crossings, margin-route length and flank fan. Selection
  also limits card crossings and route crossings relative to the default.
- Give labels measured space and repeat the solve when a label needs a reserved
  layer. Prefer valid candidates whose labels remain within reach of an endpoint.
- Fan overlapping route segments into distinct lanes, carrying their labels;
  slide small endpoint jogs when safe.
- Round corners, protecting reserved label footprints, and bridge route
  crossings. These are post-layout drawing operations.
- Apply the normal layered-engine spacing defaults at each hierarchy level.

These global policies are chiefly in `layout/compound.ts`, `compound-graph.ts`,
`flank-rules.ts`, `scorecard.ts`, `label-reservations.ts`, `shared-runs.ts`,
`jogs.ts` and `curves.ts`.

## Where simplification has the most potential

The most coupled remaining area is explicit boundary splitting, fixed header
detours and engine hierarchy ordering. Removing it requires a working native
hierarchy route, not another exception around the same engine failure. The
multiple flank candidates and their scorecard are another substantial policy
layer affecting placement. The no-fold restriction is a smaller, isolated
workaround suitable for a measured probe.

Containment, measured text, title clearance and non-overlap are the underlying
contracts. The routing workarounds should earn their place with an observable
failure; they are not architectural meaning authored on a board.
