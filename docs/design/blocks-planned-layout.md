# Planned Blocks layout

Status: proposed for TASK-554 on 2026-10-28.

Blocks will choose placement, ports, labels, and shared trunks in one plan before it routes lines.
The plan will reserve physical space for each choice.
Routing will assign coordinates inside those reservations.
This replaces the repeated placement and repair sequence for Blocks.
Track keeps its current geometry and behavior.

The affected readers are architects who trace dense boards and agents who maintain the renderer.
The intended improvements are shorter lines, tighter frames, and first renders and growing edits below 500 ms.
The design has one private planning interface and fewer geometry repair passes.
The spike establishes some contracts, but it does not establish acceptance of the complete design.

## Evidence and scope

The five exploration reports live under `/tmp/blocks-explore/{packing,layered,sideports,labels,speed}/report.md`.
Their code remains on the corresponding `explore/blocks-*` branches.
These temporary paths identify this investigation's evidence, not required inputs to the product.

| Exploration    | Measured result                                                                                    | Consequence for this design                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Packing        | Mean area falls 5.57%, but route length rises 1.24%. It introduces 21 failing historical drawings. | A size-only packing estimate is insufficient. Score the actual planned corridors and port positions.          |
| Layered        | Route length falls 9.20%, but area rises 1.02%. The final candidate has 5,905 geometric findings.  | Use ranks as local order hints. Keep measured containment, exact headers, and owned lanes outside the ranker. |
| Side ports     | Bends fall from 2.3546 to 2.1276. Two shared-trunk tests fail.                                     | Plan source and target fans together. Do not reroute each line independently after placement.                 |
| Label elements | 29.82% of labels become horizontal. Area falls 0.48%, while endpoint distance rises 48.9%.         | Reserve a source-owned label slot before packing. A free distant run is not an adequate label home.           |
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

For each relationship, reserve its horizontal label slot near its source before final packing.
Prefer the first private horizontal run after its source stem.
If the source leaves vertically, reserve a short horizontal departure beside the source.
The label precedes any fan-in merge.
It follows any fan-out split that carries labels with different meanings.

Keep the label inside one declared containing scope.
Its complete padded rectangle must fit there without crossing any frame wall.
The padding includes line clearance and the existing label background.
A label's slot counts as occupied space when a shelf or scope measures its size.
An unlabelled edge reserves no label row.

Prefer a label within one card width of its source.
If several source labels cannot fit there, compare a second adjacent label row or a different source wall.
Measure the resulting source distance in the cost.
Do not stack an unbounded label tower and call that compact packing.
The spike demonstrates that this simple tower becomes expensive on high-degree cards.

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
    pins: [Point; 2], // horizontal, no arrowheads
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
  + 25 * privateAndSharedLength / (edgeCount * typicalCardWidth)
  + 18 * (crossings + crowdedJunctions) / max(1, edgeCount)
  + 10 * labelSourceDistance / (labelCount * typicalCardWidth)
  + 10 * backwardSteps / max(1, edgeCount)
  +  7 * paneShrink
  +  2 * bends / max(1, edgeCount)
```

Use one for an empty denominator.
Occupied area includes measured words, protected labels, cards, and required header space.
It excludes routes and surplus corridors.
Count nested empty space in its immediate owning scope, without counting it again at ancestors.

Count shared geometric length once in the space term.
Also record complete per-relationship length for the reported route measure.
Charge crowded junctions for the council's tracing stop points.
The bend term breaks close alternatives without treating every bend as a defect.
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

Initial limits are 128 obstacles, 96 coordinates per axis, and 32,768 expanded search states per local fallback.
Permit at most four fallback windows per solve.
These are starting engineering limits, not measured performance claims.
Add explicit limits to the router interface because the current search has no such contract.
Never stop based on a wall-clock deadline, because that changes geometry across hosts.

After fallback, make sure that the result respects every protected object in the complete drawing.
Reserve its accepted strokes before routing another window.
If fallback exhausts its work bound, select a conservative channel plan for the affected scope.
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
Its own route passes through the reserved center line.
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

| Existing owner                                                      | Planned Blocks replacement                     | Deletion or retained responsibility                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `place.rs`: `lay_all`, `lay_out`, `Earlier`, port-order competition | `planned::plan` and one emission               | Remove these calls from Blocks. Keep the unchanged path for Track until extraction.                                        |
| `tree.rs`, `nested.rs`, `inline.rs`, `composition.rs`               | A normalized scope tree with exact containment | Keep semantic input projection. Retire local-frame heuristics from Blocks. Move Track-specific rules with Track.           |
| `card_graph.rs`, `card_layout.rs`, `cycles.rs`                      | Local rank hints and orientation candidates    | Reuse the Graphviz adapter and cycle semantics. Stop using ranked coordinates and label ranks for Blocks.                  |
| `label_rules.rs`, `fanouts.rs`, `holding.rs`                        | Source label slots and explicit fan trees      | Remove Blocks label-before/after candidate remedies and implicit join identities.                                          |
| `packing/pack.rs`, `packings.rs`, `slides.rs`                       | Port-aware candidate packing                   | Remove post-route block sliding and fit-only prefilters from Blocks.                                                       |
| `packing/capacity.rs`, `port_room.rs`, `port_columns.rs`            | Peak interval occupancy per corridor axis      | Remove route-then-grow capacity discovery from Blocks. Reuse the independent-axis concept from packing.                    |
| `packing/trunks.rs`, `routing.rs`                                   | Planned channels and bounded local fallback    | Remove general trunk grid search and unchecked dogleg fallback from the normal Blocks path.                                |
| `settle.rs`, `orders.rs`, `sides.rs`, `walls.rs`                    | One port order and explicit portal contracts   | Remove repeated facing and port-settlement passes for Blocks.                                                              |
| `fold.rs`, `fold_layout.rs`, `wraps.rs`, `peers.rs`                 | Local orientation and shelf candidates         | Delete Blocks-specific fold, wrap, and exclusive-peer special cases after their callers disappear.                         |
| `headers.rs`, `clusters.rs`, `lone.rs`, `leaves.rs`                 | Exact measured protected objects               | Retain measurement and appearance contracts. Retire Blocks layout exceptions for lone wrappers and projected title widths. |
| `assembly.rs`, `projection.rs`, `readback.rs`, `laid.rs`            | Emission into the existing `Placed` shape      | Reuse conversion and geometry primitives. Remove obsolete block-fragment assembly only after Track stops depending on it.  |
| `steps.rs`                                                          | Lane-aware normalization during emission       | Keep duplicate and collinear-point removal. Do not run unconstrained post-plan route simplification.                       |
| `choosing.rs`                                                       | Fixed Blocks planning entry                    | Keep shared metrics and Track region decisions. No new user-facing engine mode.                                            |
| `routes/fans.rs`, `routes/folded.rs`                                | Planned junction ordering                      | Stop invoking them for Blocks. Keep them unchanged for Track.                                                              |

The end state contains one Blocks planner and the existing Track implementation.
Temporary replacement stages do not add a permanent old/new Blocks option.
Delete unreachable Blocks policies as each owning stage becomes authoritative.
Do not duplicate an entire shared module just to rename its folder.

## Tests that encode negotiable rules

Do not weaken geometry assertions or generic renderer tests.
Several tests under `operations/blocks/` actually render the default Track engine.
Their folder name is not permission to change their expectations.

| Test owner                                                                                              | Treatment                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocks/block-packing.test.ts`                                                                          | Replace exact vertical positions and zero-bend chain expectations for Blocks with orientation-aware directness and intactness. Preserve forward reading.       |
| `blocks/held-orders.test.ts`, `ports/fan-faces.test.ts`                                                 | Retire incidental face coordinates and blanket bridge counts. Preserve explicit fan identity, valid shared stems, and traceability.                            |
| `blocks/folded-parent-line.test.ts`, `routes/walls-straight.test.ts`                                    | Preserve visible header attachment, square approaches, and clearance. Reconsider only fixed bend ceilings tied to the old fold.                                |
| `blocks/entry-fork.test.ts`, `blocks/trunks.test.ts`                                                    | Preserve common-source and common-target meaning. Replace forced entry-wall locations only when the new plan proves the same ownership.                        |
| `labels/label-runs.test.ts`, `labels/relayed-labels.test.ts`, `tracks/leaving-label-frame.test.ts`      | Inspect the engine parameter. Preserve horizontal or vertical on-run ownership and wall clearance. Keep Track-specific label ranks.                            |
| `blocks/automatic-columns.test.ts`, `blocks/rank.test.ts`, `blocks/sibling-order.test.ts`               | Their inspected cases use default Track. Keep their column count, downward ranks, and sibling-order contracts unchanged.                                       |
| `ports/side-hook.test.ts`, `labels/label-runs.test.ts`                                                  | Replace forced top entries and midpoint labels for Blocks with feasible four-wall approaches and source-owned horizontal slots. Keep attachment and clearance. |
| `containers/container-packing.test.ts`, `containers/region-room.test.ts`, `blocks/packed-frame.test.ts` | Replace exact old inset and shelf coordinates. Preserve compactness with measured occupied space and no avoidable route detours.                               |
| `blocks/placement-order.test.ts`, `blocks/candidate-cancellation.test.ts`                               | Preserve array-order independence, authored-order influence, and the one-solve host contract.                                                                  |
| `crates/archboard-layout/tests/solve.rs`                                                                | Keep Graphviz refusal and invocation requirements for Track. Blocks can plan a simple scope without asking Graphviz.                                           |
| `support/drawing-integrity.ts` and its geometry helpers                                                 | Preserve every hard assertion. Add the cheapest missing plan contract where an observed failure requires it.                                                   |

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
