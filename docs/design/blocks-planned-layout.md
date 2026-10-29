# Planned Blocks layout

Status: proposed for TASK-554 on 2026-10-28, revised for the hybrid iteration on 2026-10-29.
The owner selected legacy Blocks placement with planned routing after three placement trials failed the visual gates.
The hybrid contract below supersedes the original placement proposal.
The remaining sections preserve the investigation and its earlier checkpoints.

## Hybrid contract

The legacy placer owns card positions, dependency order, block packing, frames, folds, and wraps.
The planner owns every final Blocks route and label.
Track retains its existing placement and routing behavior.
The public Solver interface, text measurement, and authored board format stay the same.

Legacy placement uses the new routes to estimate its actual gap needs.
Smaller placements are accepted when the six references retain their reading order and pass the geometry and route gates.
Report raw placement area separately from the rendered page area and routing measures.
The original one-percent rule does not require identical card coordinates or prevent smaller placements.

The placer supplies bounded candidates from its first hierarchy and its hierarchy with held port orders.
It compares their raw and settled geometry by area.
It settles the second candidate only if the earlier candidates fail.
Duplicate placements are skipped.
The obsolete side-exit hierarchy pass does not run for Blocks.
Dense scopes compare a three-row deal and a four-row cut, with columns held.
A board with at most twenty-four cards also retains the two-row cut.
Labels and boundary ports can push a small fan over the dense-scope limit.
Smaller scopes retain the wider legacy wrap search.

Fixed placement supplies measured endpoints, exact headers, region captions, walls, and route ancestry to the planner.
The planner considers four endpoint walls and the provisional routes as geometric guides.
It starts with straight, elbow, and single-channel templates.
It adds two-channel templates when the simpler templates fail.
Those templates sample nearby and distant channels so that a nearby coordinate limit cannot hide an outer passage.
Declared flow points remain exact endpoint constraints.

The planner selects routes in a deterministic order and reserves complete source and target fan membership.
Every shared run has one common semantic endpoint and one full line treatment across all its members.
Distinct relationships on opposite walls of the same card stand at least one lane apart, so they never read as one line behind the card.
Port assignment slides endpoint runs without adding bends or moving authored flow points.
Candidates include the usable wall limits and positions beside occupied opposite ports.
An existing label position remains a starting point when its padded run still fits the shifted route.
The label search indexes horizontal and vertical strokes in sorted arrays, preserving their coordinate order.
A source fan only splits, and a target fan only merges.
Unrelated lines cross only on straight portions with room around their bends and arrow approaches.
Parallel lanes and frame walls retain the established visual clearances.
The old Blocks trunk router and its unrestricted grid search never run for Blocks.

A label uses the midpoint of the longest clear private run that holds its complete measured plate.
The run can be horizontal or vertical.
The words stay horizontal.
A label never covers a shared trunk, crosses a wall, or lies under a foreign line.
If no qualifying midpoint exists, the label uses the nearest clear private spot along the route from its source.
Count those final selected placements separately from routing fallbacks.
Label placement never adds a bend or changes an endpoint.
Small clearance margins protect the result from SVG rounding.

A stack of labels must follow a vertical run that holds its full measured height.
Measurement carries the stack flag to layout, so the planner protects each visible plate rather than only their combined rectangle.
Single labels can still use either run direction.

Readability refinement has a limit of 32 relationships per view.
Within that limit, route length and bends rank before added page area.
A simple candidate that exceeds the direct distance by 300 units and 50 percent also tries the existing two-channel templates.
Reciprocal calls can reuse the bounded conflict repair when an earlier route forces that much extra travel.
The repaired route set must reduce the combined route cost.
A successful greedy plan with a route 120 units and 50 percent beyond its shortest candidate also tries the short-first order.
The planner keeps the order with fewer such detours, then the lower combined route cost.
Both attempts share the existing grid-window budget.
Dense drawings retain their existing candidate ranking and route-order search because wider refinement exceeds the render-time budget.
The label-stack rule and complete geometry guards apply at every size.

Connected conflict repair reconsiders at most three earlier routes, to depth three.
Each route-order attempt permits eight repairs, each with ninety-six conflict attempts and six distinct conflict sets per level.
Local grid windows retain limits of 128 obstacles, 192 coordinates per axis, and 32,768 search states.
Final routing shares four grid windows across its four route-order attempts for each placement candidate.
Packed-block gap estimates also use at most four local windows per packed scene.
After a complete placement refusal, the legacy placer can add 32 then 64 units around the blocked endpoints.
These are two bounded placement repairs, not a second placement algorithm or an unchecked drawing fallback.

The complete guard and fan-tree freeze must accept every emitted relationship.
Labels use a spatial index for fixed obstacles and current label rectangles.
These indexes accelerate clearance queries without changing candidate order or the label contract.
The painter measures the actual decorated ink instead of adding blanket route padding.
Crossing decoration retains its existing finite bounds.

The six reference gates require lower route length and bend counts, no area increase, zero hard findings, and clearer pictures.
The complete corpus must improve routing measures and area while retaining Track output and deterministic drawings.
First renders and growing edits on the three timing boards must include painting in the 500 ms budget.
Iteration evidence belongs in `/tmp/blocks-explore/build/report-4.md`.

## Original proposal and investigation

The original proposal gave one planner ownership of placement, ports, labels, and shared trunks.
It reserved physical space before assigning route coordinates.
That placement direction is superseded by the hybrid contract above.
The affected readers remain architects who trace dense boards and agents who maintain the renderer.

## Evidence and scope

The five exploration reports live under `/tmp/blocks-explore/{packing,layered,sideports,labels,speed}/report.md`.
Their code remains on the corresponding `explore/blocks-*` branches.
These temporary paths identify this investigation's evidence, not required inputs to the product.

| Exploration    | Measured result                                                                                    | Consequence for this design                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Packing        | Mean area falls 5.57%, but route length rises 1.24%. It introduces 21 failing historical drawings. | A size-only packing estimate is insufficient. Score the actual planned corridors and port positions.          |
| Layered        | Route length falls 9.20%, but area rises 1.02%. The final candidate has 5,905 geometric findings.  | Use ranks as local order hints. Keep measured containment, exact headers, and owned lanes outside the ranker. |
| Side ports     | Bends fall from 2.3546 to 2.1276. Two shared-trunk tests fail.                                     | Plan source and target fans together. Do not reroute each line independently after placement.                 |
| Label elements | 29.82% of labels become horizontal. Area falls 0.48%, while endpoint distance rises 48.9%.         | Keep ownership and clearance. Iteration 3 replaces source-side reservations with centered on-run labels.      |
| Speed          | Every saved Blocks and Track SVG stays identical. Blocks first renders remain above 500 ms.        | Keep the exact-output optimization. Remove general grid search from the normal Blocks path.                   |

The packing report used an earlier integrity harness.
The corrected harness resolves authored views through `scopedContent` and uses the actual render atlas.
Its baseline has 84 failing historical architecture readings, including 23 readings with geometric findings.
Sixty-one failures concern historical subject sets.
The current variants pass.
Do not combine those counts with the packing report's 164 baseline failures.

The supplied warmed Blocks first-render medians are 1,048, 613, and 791 ms.
They name Board viewer, Board persistence, and Archboard server routes, respectively.
The corresponding growing edits take 928, 606, and 783 ms.
The supplied Track figures are 238, 319, and 147 ms.
The older 280/300/140 ms figures in the shared brief do not describe this Blocks workload.

The speed profile attributes 46.94% of baseline samples to trunk search and its inlined work.
Queue insertion adds 4.84%, and grid construction adds 11.01%.
After the speed change, trunk search remains a major cost.
The current branch includes that change as `5a1d3d866`.

The hard drawing defects and the [council criteria](grading-council/criteria.md) remain binding.
Compactness and direct relationships carry 55% of the council score.
The historical rules in [layout-rules.md](layout-rules.md) explain the old implementation but do not constrain this replacement.
One deterministic solve remains the host contract from [ADR 0061](../adr/0061-group-regions-are-packed-before-solving.md).

## Vocabulary and interface

A port is a route's attachment point on a wall.
A corridor is reserved free space for routes.
A lane is one assigned track inside a corridor.
A trunk is shared ink with one explicit common endpoint.
A portal is a planned crossing through a containing frame.
A label slot is a measured rectangle owned by one relationship.
These are private renderer concepts, not new board subjects or authored layout instructions.

The public solve remains `lay_out_board(measured_graph, graphviz)`.
The caller supplies measured content and receives the existing placed drawing.
The caller does not select an orientation, manage ports, retry packing, or choose a router.
A plan exists only during that solve.
No board file, renderer host, or worker cache stores its mutable state.

The private seam is `plan(measured) -> PlannedBoard`, followed by `emit(plan) -> Placed`.
Planning includes feasibility and bounded local repair.
Only a complete feasible plan reaches emission.
The painter receives the same real relationships, measured labels, cards, and frames as today.

## Stages and ownership

| Stage                 | Owns                                                                                             | Produces                                              |
| --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Measure and normalize | Core text sizes, semantic order, containment, group membership, line treatments                  | Exact card, header, caption, and label rectangles     |
| Establish topology    | Local dependency hints, endpoint identity, candidate reading directions, allowed walls           | Scope tree, fan trees, label ownership, portal chains |
| Plan and pack         | Candidate card order, two local directions, measured child shapes, corridor capacity, port order | One feasible placement and route topology per scope   |
| Assign lanes          | Interval occupancy, junction order, exact attachment coordinates                                 | Immutable port, label, trunk, and lane coordinates    |
| Emit and guard        | Polyline construction, protected geometry, membership, endpoint attachment                       | One placed drawing or a local plan rejection          |
| Paint                 | Curves, arrowheads, glyphs, crossings, atlas                                                     | The scene and the SVG                                 |

A stage cannot repair geometry owned by an earlier stage after emission.
A conflict returns to the smallest owning scope before its plan freezes.
The host still receives one solve.
A local candidate is data inside that solve, not another whole-board solve.

### Normalize the measured hierarchy

Keep every semantic parent and every placing group as an explicit scope.
Keep a group's enclosing semantic parent separately from its visual scope parent.
This preserves the frame depths that prevent hidden parents.
Use the exact normal header size from ADR 0062.
Do not replace it with a full-width obstacle or Graphviz font placeholders.

A direct parent relationship attaches to the painted header card.
A descendant relationship crosses a free frame wall through a portal.
Those are different endpoint types.
A shared portal never implies a shared semantic endpoint.

Use the existing canonical authored order before planning.
A stable subject identity resolves a genuine tie only after authored order and topology.
Renumbering ordinary distinct-order subjects must not change geometry.
Array order, hash iteration, worker history, and wall-clock time must not choose a candidate.
Compare costs in a fixed sequence with `total_cmp`, then the candidate index.
Use the same Rust arithmetic and coordinate rounding for native and WebAssembly hosts.
A fresh process and a different request order must reproduce the same SVG.

### Establish local direction and order

Build dependencies between each scope's immediate children.
Collapse each strongly connected set for ranking.
A strongly connected set contains parts that reach each other.
Keep its return edges as real routes, with authored order as the initial internal order.
In a downward scope, a dependency rank occupies one row.
An acyclic dependency places its target below its source.
Keep each chain in one column where geometry permits.

The existing Graphviz adapter can supply ranks and crossing-reduction hints for one local graph.
Read ranks and relative order, not global cluster coordinates.
Do not add label nodes to those ranks.
Labels belong to measured route reservations.
Isolated siblings use measured packing without a ranker call.

Retain at most two feasible child shapes: top-to-bottom and left-to-right.
These are placements of upright cards, not rotations of text.
A parent compares their dimensions and external port signatures.
It does not recursively recompute a child for every packing candidate.
Each child shape exposes admissible portal intervals on all four walls and its required capacity.
The parent chooses a shape and binds those intervals to peer-facing walls before coordinates freeze.
This contract applies to every scope, including the largest scopes.
Connections between neighboring frames use their facing walls and the gap between them.
A top-down pass resolves the chosen portals inside the child's reserved corridors.
If no interval can carry the connection, reject that parent candidate before emission.

Start with dependency order, then test bounded adjacent exchanges of independent siblings.
A scope compares at most twelve complete local candidates.
Each candidate includes its walls, label slots, trunk choices, and corridor capacity.
A fixed candidate index resolves equal costs.
The limits bound work and do not depend on elapsed time.

Mixed directions require a visible local pattern.
Keep a dependency chain in one direction until a scope boundary or an explicit return.
The current council's order criterion still favors downward readings.
A horizontal candidate must earn its compactness gain against that criterion.
Do not silently reinterpret the council score to favor the implementation.

### Choose walls and label slots together

Each endpoint considers top, right, bottom, and left walls.
Reject a wall without room for its port, straight approach, arrowhead, and rounded bend.
Reject a portal whose approach crosses a header or caption.
The planner knows the real protected rectangles before it compares walls.

Choose the route topology before choosing the label's position.
Place each label at the midpoint of its longest straight run between source and target.
That run can be horizontal or vertical.
The words remain horizontal in both cases.
Never add a bend to reach a label reservation beside the source.

A label needs a private part of its relationship's route.
It follows a fan-out split and precedes a fan-in merge when differently labelled relationships share the surrounding trunks.
Reject a label position that overlaps a wall, header, card, other label, or foreign route.
If several runs share the maximum length, use a clear midpoint.
If no longest run can hold the padded label, reject the candidate.
Do not slide the label away from that run's midpoint to make it fit.
A proposed route with no valid label position remains infeasible.

Keep the complete padded label rectangle inside one containing scope along the route.
That scope need not be the source's own scope.
The padding includes line clearance and the existing label background.
Count reserved label space when measuring the route's corridor.
An unlabelled edge reserves no label space.

Source proximity is no longer a label-placement objective.
The step 8 source cells demonstrate that nearby labels can force sideways departures and long return paths.
A label remains source-owned through relationship identity, not through a rectangle attached to the source card.

### Plan explicit fan trees

A trunk key contains its common source or common target, line treatment, direction, and comparison standing.
Every member must agree on those facts.
A source fan splits outward from one source.
A target fan merges inward to one target.
An edge can use a source fan, a private middle route, and a target fan.

A trunk segment carries its complete member set.
The intersection of their source identities or target identities must contain the declared common endpoint.
The comparison projection must supply identities for every displayed reading, including historical kinds and aggregated endpoints.
A fan must remain valid in each reading that shares its geometry.
The spike found cases where `scopedContent` and the actual solve graph disagree about those facts.
Record both inputs when a drawing helper reports such a case.
Do not erase the raw failure or assume that shared screen coordinates prove semantic ownership.
Do not infer a larger trunk from pairwise compatibility.
For example, A→X and A→Y cannot merge with B→Y through transitive pairwise sharing.

Start with source fans for identical departures and target fans after source labels.
Compare shared and separate runs by saved length, branch ordering, and junction clarity.
Sharing is permitted, not mandatory.
A fan retains a branch order from its far endpoints, then authored order.
Different treatments receive different ports and lanes.
A dense fan can split into several visible stems without changing its endpoint identity.

The production plan records one tree, not several independent overlapping polylines.
Emission expands that tree back into the original relationship paths.
Traffic and arrows still belong to those relationships.
Only real target cards receive arrowheads.

## Private plan data

The following sketch defines responsibilities, not a second public serialization format.
Use existing `Node`, `Edge`, `Rect`, `Point`, `Side`, and measured text types.
Local handles are vector indices, not minted semantic subject IDs.

```rust
struct PlannedBoard {
    scopes: Vec<ScopePlan>,
    ports: Vec<PortPlan>,
    labels: Vec<LabelSlot>,
    trunks: Vec<TrunkPlan>,
    routes: Vec<RoutePlan>,
}

struct ScopePlan {
    subject: ScopeSubject, // root, semantic parent, or placing group
    parent: Option<ScopeIndex>,
    direction: ReadingAxis,
    children: Vec<ChildPlacement>,
    protected: Vec<ProtectedBox>, // cards, exact headers, captions, labels
    corridors: Vec<CorridorPlan>,
    extent: Rect,
}

struct PortPlan {
    owner: Endpoint, // card, painted header, or frame portal
    side: Side,
    order: usize,
    attachment: Point,
    approach: Rect,
}

struct LabelSlot {
    edge: EdgeIndex,
    scope: ScopeIndex,
    bounds: Rect,
    run: RunIndex,
    pins: [Point; 2], // on the owning straight run, no arrowheads
}

struct TrunkPlan {
    common: CommonEndpoint, // Source or Target, never an inferred pair
    treatment: TreatmentKey,
    members: Vec<EdgeIndex>,
    branches: Vec<TrunkBranch>,
}

struct RoutePlan {
    edge: EdgeIndex,
    source: PortIndex,
    target: PortIndex,
    pieces: Vec<PlannedPiece>, // private run, label crossing, or trunk branch
}
```

`CorridorPlan` holds its free rectangle, permitted entrances, occupied intervals, lane order, and required width.
`PlannedPiece` names a corridor and an interval rather than copying its geometry.
A trunk owns shared occupancy once.
Each private run owns occupancy separately.
A label slot remains private even when its surrounding routes share a source.

Freeze these data after feasibility succeeds.
Debug output can include candidate costs, lane peaks, fallback counts, and rejection reasons.
Keep that output outside the normal board and scene contracts.

## Packing cost and feasibility

A candidate first passes hard constraints.
Cards and child frames must not overlap or violate membership.
Headers and captions keep their exact protected areas.
Ports need clear approaches, labels need clear slots, and every corridor needs enough lane capacity.
A hard failure has no finite score.

For each feasible candidate, compute its full planned corridor paths.
Use the selected wall coordinates, portal chain, and trunk membership.
Do not substitute center-to-center distance or an unconstrained dogleg.
The emitted routes must agree with this geometry within the reserved lane displacement.
Record prediction error during development.

Start with this dimensionless cost:

```text
C = 30 * emptyArea / occupiedArea
  + 25 * (ownedLength + travelledLength) / (2 * edgeCount * typicalCardWidth)
  + 18 * (crossings + crowdedJunctions) / max(1, edgeCount)
  + 10 * backwardSteps / max(1, edgeCount)
  +  7 * paneShrink
  +  2 * bends / max(1, edgeCount)
```

Use one for an empty denominator.
Occupied area includes measured words, protected labels, cards, and required header space.
It excludes routes and surplus corridors.
Count nested empty space in its immediate owning scope, without counting it again at ancestors.

Count shared geometric length once in `ownedLength`.
Count the complete path of every relationship in `travelledLength`.
Their mean charges both occupied space and the distance that a reader follows.
Charge crowded junctions for the council's tracing stop points.
The bend term breaks close alternatives without treating every bend as a defect.
Iteration 3 removes source distance from the proposed cost.
The retained step 8 implementation still uses that term until a replacement passes the readability gate.
Pane shrink measures lost card-name size at the supported 1920×1080 pane.

These weights express the council priorities but do not reproduce its human score.
Calibrate the normalizers against the six references and the complete corpus.
Do not tune per-board exceptions.
Reject a candidate that improves the scalar cost but introduces a real hard defect.
The council still decides visual acceptance.

## Channel routing and bounded fallback

Build horizontal and vertical corridors between measured shelves and beside scope walls.
The planner reserves a connection through each corridor junction.
Its route topology states which portals and junctions each line visits.
Channel routing places those runs on the reserved lanes.
It does not search a dense coordinate grid for every relationship.

Within a straight corridor, sort occupied intervals by their start, then end, then stable route order.
Reuse the lowest lane whose previous interval ends before the new interval's required clearance.
Count a planned trunk as one occupant.
Reserve every endpoint approach before assigning the first lane.
Capacity uses peak simultaneous occupancy, not the total count of relationships touching a scope.

Carry lane order through bends and branches.
A junction cannot silently swap two lanes.
If incompatible ordering requires a crossing, reserve its location away from bends, labels, and arrow approaches.
If the ordering constraints form a cycle, split a trunk or reserve an explicit dogleg.
Do not relax the ownership rule to complete a route.

Grow horizontal and vertical gaps independently from the computed occupancy.
The growth occurs before final placement.
Keep two repair attempts per affected scope.
Each attempt records the unsatisfied capacity and the added room.
Repeated whole-board settling is not part of the normal path.

A bounded fallback handles a corridor junction that the channel templates cannot connect.
Reuse the sideports branch's fixed-stroke router support.
Give it the exact locked ports, obstacle rectangles, and earlier lane reservations.
Bound the window to the owning scope and neighboring corridor junctions.
Reject rather than truncate a window that omits an intersecting obstacle.

The local limits are 128 obstacles, 192 coordinates per axis, and 32,768 expanded search states per fallback.
The initial 96-coordinate limit refused useful local windows before search began.
Permit at most four fallback windows per solve.
These are operation limits, not measured performance claims.
Add explicit limits to the router interface because the current search has no such contract.
Never stop based on a wall-clock deadline, because that changes geometry across hosts.

After fallback, make sure that the result respects every protected object in the complete drawing.
Reserve its accepted strokes before routing another window.
If fallback exhausts its work bound, select a conservative channel plan for the affected scope.
Graph size alone does not select conservative construction in the revised target.
Count each selected conservative construction and its scope visits.
That plan keeps distinct lanes and extra room rather than drawing an unchecked dogleg.
The spike is evidence for this conservative construction, not for its visual quality.
A capacity failure must remain inspectable through the solve's diagnostic counters.

## Labels, painting, and final authority

The core measures each label once with the existing glyph system.
Its final rectangle stays horizontal and keeps its complete multi-line text.
The relationship passes through both label pins as one path.
The label receives no semantic node ID and no arrowhead.
The existing scene, hit target, glyph painting, and relationship identity remain usable.

The label's protected rectangle excludes every foreign route, including a perpendicular crossing.
Its own route passes through the reserved center line, horizontally or vertically.
A label cannot sit over a trunk shared by differently labelled branches.
Keep branch and merge points outside its protected rectangle.

The plan owns final bend positions.
Blocks uses crossing decoration without the later fan-order and folded-route transformations.
Filtering comparison context preserves those same coordinates and recalculates only crossing decoration.
The atlas uses planned routes with fixed decoration padding, independent of which crossings remain visible.
This preserves edge bounds when comparison context disappears.
Track keeps its existing transformations.
The sideports exploration already supplies this separation in `shown_settled_drawing`.

Dense planned crossings can still make painting slow.
The spike's tiny solve times do not imply a fast end-to-end render.
The acceptance budget therefore includes crossing decoration, scene generation, and SVG painting.

## Replacement and deletion map

The current `blocks/` directory also implements Track's inline and packed-group paths.
A file's location does not establish that it belongs only to Blocks.
Use the complete Track corpus as the byte oracle during extraction.

| Existing owner                                                      | Planned Blocks replacement                         | Deletion or retained responsibility                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `place.rs`: `lay_all`, `lay_out`, `Earlier`, port-order competition | `planned::plan` and one emission                   | Remove these calls from Blocks. Keep the unchanged path for Track until extraction.                                        |
| `tree.rs`, `nested.rs`, `inline.rs`, `composition.rs`               | A normalized scope tree with exact containment     | Keep semantic input projection. Retire local-frame heuristics from Blocks. Move Track-specific rules with Track.           |
| `card_graph.rs`, `card_layout.rs`, `cycles.rs`                      | Local rank hints and orientation candidates        | Reuse the Graphviz adapter and cycle semantics. Stop using ranked coordinates and label ranks for Blocks.                  |
| `label_rules.rs`, `fanouts.rs`, `holding.rs`                        | Route-owned label positions and explicit fan trees | Remove Blocks label-before/after candidate remedies and implicit join identities.                                          |
| `packing/pack.rs`, `packings.rs`, `slides.rs`                       | Port-aware candidate packing                       | Remove post-route block sliding and fit-only prefilters from Blocks.                                                       |
| `packing/capacity.rs`, `port_room.rs`, `port_columns.rs`            | Peak interval occupancy per corridor axis          | Remove route-then-grow capacity discovery from Blocks. Reuse the independent-axis concept from packing.                    |
| `packing/trunks.rs`, `routing.rs`                                   | Planned channels and bounded local fallback        | Remove general trunk grid search and unchecked dogleg fallback from the normal Blocks path.                                |
| `settle.rs`, `orders.rs`, `sides.rs`, `walls.rs`                    | One port order and explicit portal contracts       | Remove repeated facing and port-settlement passes for Blocks.                                                              |
| `fold.rs`, `fold_layout.rs`, `wraps.rs`, `peers.rs`                 | Local orientation and shelf candidates             | Delete Blocks-specific fold, wrap, and exclusive-peer special cases after their callers disappear.                         |
| `headers.rs`, `clusters.rs`, `lone.rs`, `leaves.rs`                 | Exact measured protected objects                   | Retain measurement and appearance contracts. Retire Blocks layout exceptions for lone wrappers and projected title widths. |
| `assembly.rs`, `projection.rs`, `readback.rs`, `laid.rs`            | Emission into the existing `Placed` shape          | Reuse conversion and geometry primitives. Remove obsolete block-fragment assembly only after Track stops depending on it.  |
| `steps.rs`                                                          | Lane-aware normalization during emission           | Keep duplicate and collinear-point removal. Do not run unconstrained post-plan route simplification.                       |
| `choosing.rs`                                                       | Fixed Blocks planning entry                        | Keep shared metrics and Track region decisions. No new user-facing engine mode.                                            |
| `routes/fans.rs`, `routes/folded.rs`                                | Planned junction ordering                          | Stop invoking them for Blocks. Keep them unchanged for Track.                                                              |

The end state contains one Blocks planner and the existing Track implementation.
Temporary replacement stages do not add a permanent old/new Blocks option.
Delete unreachable Blocks policies as each owning stage becomes authoritative.
Do not duplicate an entire shared module just to rename its folder.

## Tests that encode negotiable rules

Do not weaken geometry assertions or generic renderer tests.
Several tests under `operations/blocks/` actually render the default Track engine.
Their folder name is not permission to change their expectations.

| Test owner                                                                                              | Treatment                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocks/block-packing.test.ts`                                                                          | Replace exact vertical positions and zero-bend chain expectations for Blocks with orientation-aware directness and intactness. Preserve forward reading. |
| `blocks/held-orders.test.ts`, `ports/fan-faces.test.ts`                                                 | Retire incidental face coordinates and blanket bridge counts. Preserve explicit fan identity, valid shared stems, and traceability.                      |
| `blocks/folded-parent-line.test.ts`, `routes/walls-straight.test.ts`                                    | Preserve visible header attachment, square approaches, and clearance. Reconsider only fixed bend ceilings tied to the old fold.                          |
| `blocks/entry-fork.test.ts`, `blocks/trunks.test.ts`                                                    | Preserve common-source and common-target meaning. Replace forced entry-wall locations only when the new plan proves the same ownership.                  |
| `labels/label-runs.test.ts`, `labels/relayed-labels.test.ts`, `tracks/leaving-label-frame.test.ts`      | Inspect the engine parameter. Preserve horizontal or vertical on-run ownership and wall clearance. Keep Track-specific label ranks.                      |
| `blocks/automatic-columns.test.ts`, `blocks/rank.test.ts`, `blocks/sibling-order.test.ts`               | Their inspected cases use default Track. Keep their column count, downward ranks, and sibling-order contracts unchanged.                                 |
| `ports/side-hook.test.ts`, `labels/label-runs.test.ts`                                                  | Allow four-wall Blocks approaches and require labels on centered clear straight runs. Keep attachment and clearance.                                     |
| `containers/container-packing.test.ts`, `containers/region-room.test.ts`, `blocks/packed-frame.test.ts` | Replace exact old inset and shelf coordinates. Preserve compactness with measured occupied space and no avoidable route detours.                         |
| `blocks/placement-order.test.ts`, `blocks/candidate-cancellation.test.ts`                               | Preserve array-order independence, authored-order influence, and the one-solve host contract.                                                            |
| `crates/archboard-layout/tests/solve.rs`                                                                | Keep Graphviz refusal and invocation requirements for Track. Blocks can plan a simple scope without asking Graphviz.                                     |
| `support/drawing-integrity.ts` and its geometry helpers                                                 | Preserve every hard assertion. Add the cheapest missing plan contract where an observed failure requires it.                                             |

Keep focused fixtures for mixed-treatment fans, parent-header endpoints, loops, nested groups, and labels beside frame walls.
A plan test must catch a behavioral regression, such as transitive trunk merging or an under-reserved junction.
Do not snapshot the private plan spelling or test every helper separately.
Use complete corpus runs for exploration and release evidence, not thousands of new permanent unit tests.

## Proposed speed budget

These are targets for a warmed first render of each large board, with no earlier layout of that board.
A growing edit must also fit this budget.
Measure real card growth and pass `layout: "blocks"` explicitly.
Report cold initialization separately.

| Stage                                    | Budget, ms |
| ---------------------------------------- | ---------: |
| Text measurement and input normalization |         45 |
| Local rank hints and fan topology        |         45 |
| Candidate packing and feasibility        |         65 |
| Lane assignment and emission             |         35 |
| All bounded fallback work                |         40 |
| Geometry guard and page fit              |         20 |
| Crossing decoration                      |         55 |
| Scene and SVG painting                   |        100 |
| Host transfer and scheduling             |         45 |
| Total                                    |        450 |
| Headroom below the target                |         50 |

Measure each stage independently in native replays and the warmed WebAssembly harness.
Also record candidate count, peak lanes, fallbacks, emitted segments, and crossings.
A faster solve with an expensive final picture does not meet the target.
The spike specifically tests this distinction.
Its timer isolates the solve from the rest of rendering.
It does not isolate crossing decoration from scene generation and SVG painting.
A native profile must identify that remaining cost before implementation assigns an optimization to one function.

## Ordered implementation steps

Each step retains a drawable corpus and introduces no new hard finding.
The original baseline findings remain named debts, not a numeric allowance for different defects.
Compare finding identities by drawing, category, and subjects.
Each enabled stage also keeps Track byte-identical.
The existing comparison-toggle geometry contract remains mandatory.
The spike fails that contract and does not establish its replacement.

1. Capture the corrected baseline, six pictures, growth workload, and stage counters.
   Preserve the speed commit and one-solve contract.
   Create the parent-owned proposals on Renderer layout and Semantic renderer before production work.
2. Extract the common measured input and the unchanged Track path.
   Keep the current Blocks output while adding the private scope and endpoint model.
   Make sure that every old result is still byte-identical.
3. Build plans in memory beside the existing result, without selecting their geometry.
   Record source label slots, all four candidate walls, exact protected boxes, and explicit fan membership.
   Assert ownership and completeness through focused fixtures.
4. Implement conservative channel emission with deterministic capacity.
   Enable it only for graph classes that pass their corpus, appearance, and performance gates.
   Unsupported classes keep the existing implementation during this replacement step.
   The spike informs this stage but its poor composition prevents wholesale adoption.
5. Replace conservative ports with peer-facing portals and interval lane reuse.
   Add four-wall endpoints and both local reading directions as one candidate contract.
   Compare measured child shapes before choosing their parent packing.
   Remove source label towers through bounded adjacent label-slot candidates.
6. Add port-aware shelf choices, local rank hints, and junction order constraints.
   Make the packing score use the channel plan that emission consumes.
   Retire the old Blocks fold, wrap, facing, and sliding policies as their graph classes migrate.
7. Add the bounded fallback and the complete-drawing guard.
   Use fixed-stroke reservations and deterministic operation limits.
   Retain the conservative channel plan for local exhaustion.
   Remove every unchecked dogleg and every post-plan geometry repair from Blocks.
8. Replace the remaining Blocks classes and delete the temporary legacy dispatcher.
   Run the complete Blocks corpus, corrected integrity inventory, Track byte comparison, and real growth timing pairs.
   Run the repository gate and the visual council before production acceptance.
   Adopt the architecture proposals only when that evidence passes.

A step that cannot keep its corpus intact remains disabled at its replacement seam.
This is a development checkpoint, not a shipped configuration flag.
Do not merge known regressions with a promise that the next step repairs them.

### Build checkpoint: baseline

The implementation starts at `5b82ce00d` on `feat/blocks-planned`.
Step 1 retains the complete baseline in `/tmp/blocks-explore/base` and the unchanged Track corpus in `/tmp/blocks-explore/speed/track-before`.
Each corpus contains 4,043 drawings.
The copied integrity inventory preserves all 84 failures, including the 61 historical subject-set mismatches.
Finding identities, rather than counts alone, decide whether a new layout introduces a defect.

The build evidence lives in `/tmp/blocks-explore/build`.
Its tools reuse the exploration harnesses, with imports changed to this checkout.
The six dark references and the source-matched baseline core stay outside Git.
The growth workload increases Browser client from 72 to 139 units and the other two measured cards from 105 to 139 units.
The host records solve count, solve duration, complete render duration, and actual card growth.
Complete render duration includes crossing decoration and painting.
The later planner records deterministic candidate and lane counts without using elapsed time to choose geometry.

The parent owns the Renderer layout and Semantic renderer proposals and Backlog updates.
This implementation does not edit the vault or Backlog.
The consumer interface and skill remain unchanged.

### Build checkpoint: measured input

Step 2 separates parsing and dispatch in `blocks/place.rs` from the unchanged placement sequence in `blocks/legacy.rs`.
Track and the temporary Blocks path still call that same sequence.
No layout policy moves into a second copy.

`blocks/planned/model.rs` normalizes semantic frames, placing groups, and painted header endpoints.
Each group keeps its semantic parent separately from its visual parent.
Each endpoint exposes all four candidate walls and its exact measured protected rectangle.
The model sorts by authored order before identity and resolves every relationship to local endpoint handles.
This checkpoint observes the model but selects no planned geometry.

### Build checkpoint: ownership before placement

Step 3 builds route ancestry, source-owned label reservations, and explicit source and target fans beside the retained layout.
Each label records four adjacent slot alternatives, with two rows on either side of its source.
Each route names its common scope and the ordered scopes that it leaves and enters.
Fan membership requires the same endpoint, direction, and treatment key, including comparison standing.
Pairwise sharing cannot combine two fans into a larger trunk.

Focused Rust fixtures cover mixed treatments, transitive pairwise sharing, grouped source labels, and direct parent-header endpoints.
This checkpoint still selects no new coordinates.

### Build checkpoint: conservative emission

Step 4 selects planned geometry for isolated measured scopes and flat, unlabelled chains whose relationships join adjacent authored siblings.
Each chain reserves one straight channel between consecutive cards before emission.
Its cards retain their measured sizes, and the route needs no ranker or general router.
Isolated scopes compare three measured shelves and preserve exact headers, captions, semantic parents, and frame depth.
Other graph classes retain the existing implementation.

This deliberately small selection establishes a drawable replacement boundary before four-wall routing and branching enter it.
The large reference boards remain on the retained implementation at this checkpoint.

The first candidate exposed two useful constraints in the existing fixtures.
Empty space below a header or caption needs only the owning frame's inset, without an extra routing band.
The initial fit penalty also preferred one tall column of ten independent cards over a readable grid.
The candidate now charges twice the magnification above the pane's natural fit.
This calibration applies to every scope and keeps the original compact-inset assertions intact.

### Build checkpoint: four-wall candidates

Step 5 admits disjoint chains across measured scopes and labels whose source owns the route's containing scope.
Each scope retains at most two shapes, with upright cards in downward or rightward readings.
The parent compares those measured shapes without recomputing its children.
Each complete local candidate includes source label cells, four-wall approaches, and its actual channel paths.
Free frame-wall crossings face the peer when the protected headers permit that approach.

Channel intervals reuse the lowest available lane in a shared gap.
The planner rejects routes through protected objects, foreign frames, other labels, or existing routes.
Unsupported branching, special flow endpoints, and source labels outside the route's owning scope retain legacy placement.
There is no grid fallback in this checkpoint.

The source cell now computes label alternatives from its real measured dimensions.
This replaces the shadow model's provisional label rectangles and removes a second geometry definition.
The topology still owns each label's relationship and containing scope.

Each emitted boundary crossing must follow the declared portal chain exactly once.
Routes cannot follow a frame wall or cross near its corner.
The existing Rust solve tests now require Graphviz invocation and refusal only for Track.
The measured-size and endpoint-attachment assertions still apply to both engines.
The planned chain test accepts either forward reading direction while retaining directness.

The corpus exposed a label detour that normalization erased.
Feasibility now requires the final polyline to cross both padded label pins on one horizontal run.
The regression fixture exercises both authored endpoint orders.
Connected scopes retain one local direction rather than wrapping a chain across shelves.
The page's existing downward reading metadata remains unchanged, while a local row can read rightward.

The test inventory changes at this checkpoint are limited to the superseded Blocks rules.
`containers/compound-layout.test.ts` now requires a direct parent route to attach to its visible header instead of its frame perimeter.
`blocks/blocks-engine.test.ts` replaces the forced source-column rule with intactness and visible header attachment.
`blocks/packed-frame.test.ts` replaces fixed center alignment with attached endpoints, a clear shortest route, and at most two bends.
`export/reading-direction.test.ts` permits a forward rightward row for Blocks and keeps Track's existing rules.
Every card, header, label, wall, frame, and endpoint integrity assertion remains in force.

### Build checkpoint: port-aware packing and ordered junctions

Step 6 collapses local strongly connected sets for ranking and keeps their real return routes.
It uses the existing reachability owner for those hints.
Independent siblings can exchange adjacent positions within the fixed candidate budget.
Each scope compares at most twelve candidates and consumes at most two capacity repairs across those candidates.
Private counters record candidate count, repair count, and peak lane occupancy.

The packing score reads the exact channel plan that emission consumes.
It counts shared ink once, measures label distance along the actual departure, and charges for junctions, return steps, bends, empty space, and pane fit.
The score now counts unused space inside a source cell, which the first cell implementation omitted.
Candidate index resolves equal scores.
The small rightward-reading charge keeps downward reading as the default when compactness and route costs tie.

Source cells reserve at most two label rows on each side of a card.
A parent header reserves up to two rows beside its exact visible slab.
Labels can belong to a nested source scope while their routes continue through an enclosing scope.
Private departure lanes keep the order of adjacent label rows through their first turn.
Horizontal and vertical gaps grow independently from peak interval occupancy before placement freezes.

Every shared run stores its complete member set and one common source or target.
A source fan only loses members as it splits, and a target fan obeys the reverse rule.
Private branches cannot merge again into a source trunk after their labels.
Source and target fans impose compatible branch-order constraints from their far endpoints.
A constraint cycle rejects the candidate.
Emission expands the frozen runs into the original relationships without changing a bend.

Selected classes bypass the legacy fold, wrap, facing, settlement, and sliding passes.
Those policies remain for Track and the unmigrated Blocks classes.
This checkpoint retains the dispatcher for special flow endpoints, self-loops, larger label fans, and drawings with no feasible noncrossing channel plan.
Steps 7 and 8 still own bounded local fallback, complete-drawing protection, fixed decoration bounds, and removal of that dispatcher.

The first broader run exposed an arrow approach shortened by route normalization.
Feasibility now reserves the straight arrow run plus the renderer's actual corner radius.
Selected plans also bypass fan and fold transformations during painting and comparison filtering.
A private solve marker carries that authority into an in-memory field that the scene does not serialize.
Track and retained Blocks drawings keep their previous settlement path.

Rank bands became too restrictive for a small dependent block that fits beside its caller.
Candidates now compare rank bands with shelves that use dependency order as a hint.
Unbranched chains still keep one local direction.
The fit calibration also changes: five percent of additional magnification is one pane-shrink unit.
This prevents a small area saving from making a short workflow unnecessarily wide and its names smaller.

The staged selection also requires the complete plan to fit the reference pane at native text scale.
The broader attempt made a four-card comparison 1,708 units wide, where the retained layout needs 600 units.
That plan fails the appearance gate even though its geometry is intact.
Larger plans remain available for development, but this checkpoint does not select them.
Step 8 must replace this temporary acceptance boundary with the complete corpus and council evidence.

`blocks/join-candidates.test.ts` retains one-solve and real-target attachment checks on all four walls.
`blocks/entry-fork.test.ts` retains every integrity fixture and removes the forced shared entry point.
Different source labels belong after a source fan splits, so their private branches cannot merge back into that source trunk at a portal.
No arrowhead, clearance, label, or other hard-defect assertion changes.

The generic legend fixture now supplies longer relationship type names to force wrapping on either engine.
Its width, placement, wrapping, and unchanged-atlas assertions all remain.
The fixture no longer depends on the old Blocks drawing being exactly narrow enough to wrap the default names.

The final checkpoint changes 283 of 4,043 Blocks drawings.
Every Track SVG remains byte-identical, and a fresh process reproduces all 8,086 SVGs with a different request order and request concurrency.
The hard-finding inventory retains the same 23 geometric failures and 61 additional historical subject-set failures.
The complete repository gate passes.

The complete-corpus averages do not yet improve.
Mean area rises from 3,899,114 to 3,900,827 square units, and frame occupancy falls from 8.3614% to 8.3548%.
Mean route length rises from 1,204.63 to 1,206.70 units, and mean detour rises from 143.53 to 144.49 units.
Bends per route rise from 2.3546 to 2.3631, and routes with at least four bends rise from 31.0623% to 31.1220%.
Source cells and noncrossing templates still reserve too much room on some selected classes.

All six reference SVGs remain identical to the baseline, so this checkpoint establishes no visual improvement on those references.
Their dark PNGs retain the large empty frames, long departures, and small whole-board text that motivated the replacement.
The three large boards remain on legacy placement.
Their warmed first-render and growth medians are 1,077/938, 658/628, and 823/839 ms, including SVG painting.
Those pairs name Board viewer, Board persistence, and Archboard server routes, respectively.
None reaches the 500 ms target.
The raw measurements and individual picture judgments live in `/tmp/blocks-explore/build/report-1.md`.
Steps 7 and 8 still need to establish compactness, large-board speed, and visual acceptance before production adoption.

### Build checkpoint: bounded routing and complete geometry

Step 7 permits transverse crossings with sixteen units of straight room on every arm.
The complete guard protects every card, header, caption, source label, and unrelated frame.
A shared stroke still needs one common endpoint and the same treatment across all members.
The treatment now includes the visible relationship kind when comparison context changes an overview’s majority kind.

The local router keeps all obstacle buffers that intersect its window.
It refuses oversized windows before allocating vertices and stops after the declared search-state limit.
One solve shares a budget of four windows.
The bound remains deterministic and does not use elapsed time.

Each conservative child exports complete source and target boundary paths.
Its parent places those paths with the child and reserves distinct row lanes and target-owned rails.
The parent reserves its channels against the complete child geometry.
Direct shortcuts can replace pending boundary legs before their common scope freezes.
They retain child placement, complete internal routes, labels, and protected objects.
Three shelf widths compete on the emitted paths.
Direct shortcuts compete before the scope freezes and must preserve all earlier paths and words.
Diagrams above twenty-four relationships use this construction directly to avoid repeated failed local searches.
Smaller diagrams retain eight four-wall candidates before the three conservative choices.

The cost now averages owned ink length and complete relationship length.
Owned length alone favored shared routes that were expensive for a reader to follow.
Crossings are counted once per geometric location, independent of how many relationships share a trunk.
Neither crossings nor failure to fit the pane at native text size selects legacy placement.

Crossing decoration tries at most four fixed-radius arcs per crossing.
It does not enumerate competing cluster plans for a frozen drawing.
The atlas reserves eighteen units around the frozen route, independent of visible comparison context.
An attachment keeps a 0.02-unit outward allowance for independent SVG coordinate rounding.
Track retains its previous geometry, decoration, and atlas calculation.

The second full run draws 4,043 pictures per engine.
Track matches every baseline SVG.
The corrected integrity inventory reports six existing geometry findings and no new finding, against twenty-three at baseline.
Sixty-seven drawings fail intactness, including the sixty-one historical subject-set mismatches.
The planner owns all six references and 1,218 of 1,425 measured Blocks solve calls.
The remaining 207 solves still use the temporary dispatcher until step 8 migrates their port-capacity and junction cases.
The calls contain 1,274 distinct graphs: 1,077 planned graphs and 197 graphs that use legacy placement.
These counts describe solve calls, not authored drawings.

The first broad measurement still misses the readability targets.
Mean area is 4,330,803, mean route length is 2,203.2, and bends average 3.346.
Board viewer still takes about 649 ms including paint.
Board persistence takes about 447 ms, and server routes takes about 222 ms.
The conservative diagrams show excessive margin detours and empty space.
This checkpoint establishes guarded ownership and bounded work, not production visual acceptance.

The router fixtures cover intersecting buffers, coordinate and search exhaustion, and fixed unrelated strokes.
The planner fixture covers thirty separately labelled relationships with repeated endpoints.
The tests now retain Track’s fixed columns, forced faces, bridge counts, and band alignment only for Track.
This affects `tracks/track-steps`, `containers/compound-layout`, `containers/shared-span`, `ports/fan-faces`, and `ports/side-hook`.
Blocks fixtures retain forward reading and complete drawing integrity.

`containers/container-packing` now permits asymmetric fan channels while retaining minimum card insets and containment.
`blocks/blocks-engine` replaces fixed twenty-unit routing insets with the existing prohibition against routes on the frame outline.
It keeps card and header clearance, distinct trunks, visible attachments, and intactness.
The same file replaces synchronized chain rows and forbidden short coordinate steps with forward reading and complete geometry.

`blocks/block-packing`, `blocks/held-orders`, and `routes/walls-straight` now test complete channels instead of a fixed direction or zero crossings.
`labels/label-runs` retains label ownership, label separation, and card clearance instead of midpoint placement.
The removed `routes/turn-back` fixture and two Blocks cases in `routes/routing-rules` encoded the replaced jog and lap policies.
Backward travel remains a measured cost, not a forbidden geometry class.
No hard-defect helper, Track assertion, lint rule, or type rule changes.
A comparison regression also proves that visible kinds cannot share a trunk and that toggling context preserves atlas bounds.

### Build checkpoint: complete Blocks ownership

Step 8 removes the temporary dispatcher.
Every Blocks architecture graph enters the planner, including large label fans, self-loops, and declared flow endpoints.
A failed complete plan returns a named layout error.
It never silently calls the former Blocks placement path.
Track retains its existing implementation.

Source cells first try labels beside the card.
The planner keeps that compact cell only when its departure paths preserve label clearance and trunk ownership.
Otherwise, the cell reserves staggered labels below the card.
Source attachments use eight-unit spacing without arrowheads, while target attachments retain sixteen-unit spacing.
The complete treatment includes kind, emphasis, traffic, and comparison standing.
Different visible treatments cannot share a source departure or target arrival.

Flow decisions retain their declared bottom points and inset.
Their source labels follow those points, and an independent channel brings incoming relationships to the top face.
Self-loops use the same source cells, channel reservation, and complete guard as other relationships.
The planner adds no public layout configuration.

The conservative construction retains one tall and one wide child when both exist.
Large scopes compare three shelf widths for each retained child choice, with at most six candidates.
Small scopes compare two widths after the eight normal candidates, with at most twelve candidates in total.
The widest shelf can place two of the largest children together.
Parents reuse measured children instead of recursively rebuilding them for each candidate.

Crossing decoration now tries arcs at only the first 128 crossings, with at most four radii per crossing.
Later crossings retain the existing plain crossing and junction cuts.
This bounds arc collision work across the whole drawing, including dense large boards.
The bound follows stable route order and does not depend on time.

The final simplicity pass removes the old Blocks nesting mode and its fanout and nested-placement modules.
It also removes Blocks-only branches from projection, card construction, routing, wrapping, settlement, and endpoint handling.
The remaining legacy modules serve Track and keep its output contract.
The tests cover mixed treatments, large source fans, labelled and unlabelled loops, and declared decision points.
`blocks/blocks-engine` now tests complete geometry for group exits and arrivals from below instead of requiring one wall.
`routes/skipped-connections` keeps Track’s chain-side rule while Blocks retains card clearance and complete integrity.
The legend fixture shortens its sample names so each entry fits the narrower drawing.
Its width, row-wrapping, atlas, and placement assertions remain unchanged.

The final step 8 corpus contains 4,043 drawings per engine and 67,033 routes.
All 2,395 architecture readings use the planner.
The 1,425 measured Blocks solve calls contain 1,274 distinct graphs, all planned.
No Blocks architecture class uses legacy placement.
All 4,043 Track SVGs match the baseline exactly.

The geometry inventory reports zero findings, down from twenty-three at baseline.
All 398 whole-board readings pass integrity.
The same sixty-one historical subject-set mismatches remain in scoped readings.
Mean area rises 21.93% to 4,754,129 square units.
Frame occupancy falls from 8.36% to 7.71%.
Mean route length rises from 1,204.63 to 2,560.30 units, and mean detour rises from 143.53 to 1,246.79 units.
Bends average 3.4014 per route, and 39.58% of routes have at least four bends.
These results miss every corpus compactness target.

Three quiet baseline/current timing pairs include SVG painting and actual card growth.
Board viewer takes 300/260 ms, Board persistence takes 256/231 ms, and Archboard server routes takes 212/188 ms at the median.
Each pair names first render and growing edit.
All six medians meet the 500 ms target.
A fresh process with reversed engine order and three concurrent jobs reproduces all 8,086 SVGs exactly.
The final complete repository gate passes, including all nineteen browser owners.

The six pictures retain clear source labels but still contain long perimeter routes and empty frames.
The large conservative construction still exports fixed-side portals and bottom arrivals.
Choosing nearby portal faces and reusing short corridor intervals remain the main geometric limitations.
The complete corpus and six pictures still decide compactness and visual acceptance.
The conservative channels can reserve too much space and produce long trips around nested frames.
Planner ownership and bounded runtime do not establish better readability.
Production adoption remains pending the final evidence and visual council.

### Iteration 3: rejected readability trials

No layout change from this iteration is retained.
All six reference pictures must improve against the original baseline before a layout change can remain on the branch.
Ownership, zero geometry findings, Track equality, determinism, and the 500 ms timing target remain required.
The report and pictures live under `/tmp/blocks-explore/build/report-3.md` and `pictures-3/`.

The trials removed normal source-label cells and placed words on clear horizontal or vertical route segments.
They tested dependency rows, nearby treatment ports, four-wall frame entrances, and scope-local conservative fallback.
Later trials used the existing Graphviz adapter for local alignment and measured spacing, without using the old Blocks repair pipeline.
They also tested private bounded joins and packed independent components.
Some diagnostic variants placed labels within clear subintervals rather than at whole-run midpoints.
That differs from the requested midpoint rule.
These mechanisms remained experimental and were removed after measurement.

The first rendered trial increased the six references' combined area by 17.99% and route length by 105.01%.
Bends rose from 1,953 to 2,527.
The second increased combined area by 22.30% and route length by 108.37%.
Its bend count was 2,585.
Both rendered trials had zero geometry findings on the six references.
Neither passed the retention gate.

The second trial shortened Semantic renderer's routes by 25.75% and reduced its bends from nineteen to fourteen.
Its area still rose 5.23%.
The three large boards still selected conservative construction and retained long perimeter routes.
Some native solves exceeded 500 ms before painting.
Local gains did not produce a complete improvement against the baseline.

Greedy label placement can block later fan members.
Deferring all labels can instead leave a valid route without a long enough private segment for its words.
The trials exposed both failures.
A replacement must coordinate label room and external portals before freezing the affected child geometry.
Adding more route templates alone did not resolve that composition problem within the speed budget.

A temporary counter measured the retained planner across the complete corpus.
Conservative construction handles 604 of 1,274 distinct Blocks graphs and visits 3,429 scopes.
It handles all 488 distinct graphs above twenty-four relationships and 116 smaller graphs.
Including repeated solve calls, it handles 634 of 1,425 calls and visits 3,557 scopes.
These counts exclude speculative candidates inside each scope.
They describe solves, not authored boards or rendered views.

The six references use conservative construction for Board viewer, Board persistence, server routes, and Command interface.
Their scope counts are twelve, twelve, eleven, and nine, respectively.
Renderer layout and Semantic renderer use the normal planner.
The counting build reproduces all 8,086 step 8 SVGs exactly.
The temporary instrumentation is removed after measurement.

The retained code remains at the step 8 geometry contract.
This includes source cells and the large-graph conservative path.
The revised label, rank, and portal requirements remain unimplemented acceptance work.

## Risks and decisions left to evidence

The largest risk is conservative over-reservation.
A private lane per relationship is easy to reason about but can consume more space than the old router.
The spike measures that cost directly.
Peak interval reuse and peer-facing portals must reduce it without hiding ownership.

Local choices can create a poor global shape.
Two retained child shapes give the parent a useful choice without an exponential search.
The complete references decide whether two shapes and twelve candidates suffice.
Increase a bound only after evidence identifies a missed class of composition.

Fan trees can reduce ink while making tracing harder.
Their semantic validity is necessary but insufficient for a good council score.
Keep busy-card tracing and junction counts in the acceptance evidence.

A free horizontal run can place a label far from its source.
Keep source distance and label congestion as separate measures.
The labels exploration already shows that valid ownership alone misses this problem.

A safe route can create thousands of crossings that make decoration and painting slow.
Measure that work after solving.
Do not claim the 500 ms target from solve time alone.

The corrected integrity helper still has gaps beyond its listed assertions.
Inspect arrowheads, clipping, frame membership, and crowded junctions in the actual pictures.
Keep the council as the acceptance authority for changed appearance.

## Spike evidence

The spike lives on `explore/blocks-planned-spike` at `9b91136d7e4a3332cb7c945e8745298d925a0b3c`.
Its parent is `323288ed7` and includes the exact-output speed change.
Its four planning modules reserve source labels and private channels, compare five shelves, and emit the chosen topology.
It bypasses Graphviz and general grid search for Blocks.
It retains conservative scope ports and does not implement the complete normal path proposed above.

Do not adopt this spike as a production layout.
All six references pass the drawing integrity helper, but every inspected picture becomes larger and harder to trace.
The source label towers, serial shelves, and long perimeter bundles demonstrate why nearby portals and interval reuse are mandatory.

| Measure                           |       Before |         After |
| --------------------------------- | -----------: | ------------: |
| Mean area, square units           | 3,899,114.15 |  8,402,095.83 |
| Mean width / height               |       1.0097 |        0.9483 |
| Frame occupancy                   |        8.36% |         3.99% |
| Mean route length, units          |     1,204.63 |      4,742.21 |
| Mean excess route distance, units |       143.53 |      2,838.36 |
| Bends per route                   |       2.3546 |        6.0324 |
| Routes with four or more bends    |       31.06% |        60.98% |
| Changed drawings                  |            0 | 2,394 / 4,043 |

| Reference               |      Area before / after | Occupancy before / after | Total route length before / after | Bends per route before / after | Routes with 4+ bends before / after |
| ----------------------- | -----------------------: | -----------------------: | --------------------------------: | -----------------------------: | ----------------------------------: |
| Command interface       |  11,458,680 / 41,911,668 |           16.11% / 5.54% |                  85,618 / 481,384 |                   3.85 / 10.66 |                             24 / 41 |
| Board viewer            | 46,486,726 / 134,078,100 |            6.21% / 3.22% |               475,901 / 1,759,021 |                   5.47 / 10.20 |                            82 / 128 |
| Board persistence       | 45,599,708 / 106,062,660 |            5.20% / 2.71% |               401,561 / 1,424,059 |                   5.72 / 11.24 |                            83 / 108 |
| Archboard server routes |  31,334,064 / 80,537,118 |            7.46% / 3.26% |               288,971 / 1,224,241 |                   5.06 / 11.72 |                             59 / 87 |
| Renderer layout         |    3,184,144 / 9,622,437 |           20.22% / 7.55% |                    7,378 / 59,502 |                    1.29 / 8.71 |                              2 / 14 |
| Semantic renderer       |    1,507,215 / 4,573,274 |           22.83% / 9.39% |                    5,636 / 32,487 |                    2.38 / 8.75 |                               2 / 8 |

| Reference               | Solve before / after, ms | Complete first render before / after, ms | Growing edit before / after, ms |
| ----------------------- | -----------------------: | ---------------------------------------: | ------------------------------: |
| Command interface       |             86.55 / 1.01 |                                110 / 192 |     Not part of growth workload |
| Board viewer            |            887.74 / 6.08 |                              1076 / 3636 |                      949 / 3588 |
| Board persistence       |            508.35 / 2.35 |                               626 / 4388 |                      620 / 4420 |
| Archboard server routes |            728.44 / 1.87 |                               807 / 3775 |                      796 / 3874 |
| Renderer layout         |              6.98 / 0.40 |                                  18 / 18 |     Not part of growth workload |
| Semantic renderer       |              6.55 / 0.30 |                                  15 / 10 |     Not part of growth workload |

The large-board timing rows are medians of three alternating fresh-process pairs after an unrelated warm-up.
The smaller references use one capture from the third pair.
Each first render asks one solve.
Solve times include the worker round trip.
The three real edits increase card height to 139 units, from 72, 105, and 105 units.
The small solve costs do not meet the complete-render target.
No timing pair overlaps this task's builds, tests, or corpus work.

Both corpora contain 4,043 drawings and 67,033 routes.
Area means weight drawings equally, and route means weight relationships or flow steps equally.
Frame occupancy uses visible card area and excludes labels.
The final corpus changes 2,394 drawings.
All 4,043 Track drawings stay byte-identical.
An independent integrity render reproduces every final Blocks SVG hash.

The raw integrity helper fails 84 of 2,395 architecture readings before and 87 after.
The after run has 41 ambiguity findings across 26 historical views, compared with 17 before.
It has no card strikes, header strikes, detached ends, hidden frames, wall-crossing labels, or foreign routes under labels.
All 98 current dogfood readings pass before and after.
The unchanged 61 subject-set failures remain recorded.

The 41 final ambiguity findings concern differences between `scopedContent` and the actual solve graph's endpoint or kind facts.
Captured solve inputs remove those ambiguity findings when used as the helper's relationship facts.
This evidence exposes an input-contract question and does not turn the raw helper run into a pass.
The previous candidate also contained two real source-stem collisions, which the final correction removes.

The final module lane retains 46 renderer failures and the known rust-analyzer failure.
The renderer failures include genuine directness, fan-continuity, and comparison-toggle shortcomings, as well as exact old face and spacing expectations.
The full Nix gate stops at two Rust integration tests that demand a Graphviz call from every Blocks solve.
Lint, formatting, types, Clippy, Rust documentation, and builds pass.
The remaining system, repository, and serial browser lanes pass.
No test or lint requirement is weakened.

The report and raw measurements live under `/tmp/blocks-explore/design/`.
The six before/after PNG pairs live in its `pictures/` directory.
The report records a separate visual judgment for each pair.
The three smaller views are What the CLI can be asked, Responsibilities, and Renderer integration.
The three large references use their complete boards.

The spike's final simplification removes a redundant portal map.
Its paths already carry the boundary endpoints that a parent needs.
The consumer skill and command interface do not change.
The parent retains Backlog and architecture-vault work under the exploration brief.
