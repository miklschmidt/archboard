# Archify graph-quality research

Date: 2026-09-04

Scope: identify the Archify agent skill, explain what actually produces its graph quality, and
rank mechanisms that fit Archboard. This investigation changed no product source, skill, test, or
Backlog record.

## Recommendation

Borrow Archify's bounded geometry loop, not its document or renderer:

1. Complete existing TASK-146 so standalone text becomes a real routing obstacle in
   `archboard check`. This repairs a demonstrated false-clean completion gate.
2. Then run a narrow, fixture-backed spike for an explicit connector-routing operation. Generate
   a small deterministic set of routes for named connectors, reject candidates through the public
   inspection contract, rank the survivors lexicographically, and emit one proposed replacement set
   without writing it. A later product command would apply that set in one atomic write. Do not move
   nodes or silently tidy a human's layout.

Do not add general auto-layout, topology classification, another JSON IR, or an Archify-style SVG
renderer. The investigated Archify does not automatically classify or lay out architecture
topology either: its agent chooses the diagram type and positions, and its renderer makes those
choices reproducible and checks them. Its more capable workflow compiler still begins with
author-supplied lanes and logical columns.

The affected Archboard workflow is an agent composing or repairing a 6–12-node architecture
board. TASK-146 has an observable improvement: `archboard check --strict` stops approving the
known connector-through-text defect. The routing spike tests whether one computed replacement set
can remove those findings without moving anything else. Fewer human repair batches remain a
hypothesis. Archboard has no captured manual baseline for that claim, which is why the second
proposal is an experiment rather than a permanent layout system.

## Which Archify

The target is [`tt-a1i/archify`](https://github.com/tt-a1i/archify), whose repository description,
[`archify/SKILL.md`](https://github.com/tt-a1i/archify/blob/60080fbbe53198732cf18d1602bbb9804d32a23d/archify/SKILL.md),
and stable
[`skill-release.json`](https://github.com/tt-a1i/archify/blob/v2.16.0/archify/skill-release.json)
all identify it as the agent skill for architecture, workflow, sequence, data-flow, and lifecycle
diagrams. The current stable release is **v2.16.0** (tagged commit
[`c826e6c`](https://github.com/tt-a1i/archify/tree/c826e6c3a7abad19c0f3cd1ca57207d54b1ad8de)).
I also inspected development head
[`60080fb`](https://github.com/tt-a1i/archify/tree/60080fbbe53198732cf18d1602bbb9804d32a23d),
whose package declares `2.17.0-dev.1`. Unless stated otherwise, mechanisms below exist in v2.16.0;
development-head observations are identified as such.

This disambiguation matters. GitHub also has an unrelated macOS universal-binary utility
[`Oct4Pie/archify`](https://github.com/Oct4Pie/archify), a local-first code-intelligence browser
extension [`Salah-XD/archify`](https://github.com/Salah-XD/archify), an older
[`alksnd/archify`](https://github.com/alksnd/archify) fork, an Archify web UI, ports, skill mirrors,
and an unrelated 2021 decision-recommender paper. They are not the package described by the
canonical release manifest and were not used as design evidence.

## What produces the quality

### 1. The agent owns topology and composition

The skill asks the agent to choose one of five diagram grammars, keep architecture diagrams to
roughly 6–12 primary nodes, establish one main reading path, group only real boundaries, and
prefer a left-to-right spine with short vertical branches. Its architecture grid is explicitly
"not auto-layout." It converts author-selected row and column cells to fixed coordinates
([`grid.mjs`](https://github.com/tt-a1i/archify/blob/c826e6c3a7abad19c0f3cd1ca57207d54b1ad8de/archify/renderers/architecture/grid.mjs)).
Free placement remains supported and `pos` overrides a grid cell.

This is consistent with Archify's own failed Mermaid experiment. Stock Dagre layout with Archify
CSS did not approach the hand-placed result, so the project rejected Mermaid parsing and generic
auto-layout. Its conclusion was "layout is the product, not CSS"
([experiment result](https://github.com/tt-a1i/archify/blob/60080fbbe53198732cf18d1602bbb9804d32a23d/experiments/v3-mermaid-validation/RESULT.md)).
No Graphviz, Dagre, ELK, Mermaid, or other graph-layout package appears in the v2.16 package
dependencies
([`package.json`](https://github.com/tt-a1i/archify/blob/v2.16.0/archify/package.json)).

The part worth retaining is the semantic limit and clear reading path, not an inferred topology
engine. Archboard already teaches the same composition model in
[`skills/archboard/SKILL.md`](../../skills/archboard/SKILL.md) and
[`architecture-workflow.md`](../../skills/archboard/references/architecture-workflow.md). There is
no valuable new concept to add here beyond Archify's useful explicit node-count and bounded-repair
heuristics.

### 2. Deterministic mechanical layout removes arithmetic

Architecture components use fixed grid math when requested. Boundaries derive from the bounding
boxes of their declared members, with padding and a measured title rail. The view box derives from
component and boundary geometry plus the resolved legend. This removes coordinate arithmetic
without pretending to decide architectural meaning. Sequence, data-flow, and lifecycle renderers
similarly turn author-chosen order, stages, or bands into fixed geometry.

The v2.16 `readable-v2` workflow compiler goes further. Authors still supply lanes and logical
columns `0..5`; the compiler turns those ranks into measured coordinates, expands rank or lane
gaps through at most three layout-feedback rounds, and owns the final routes, labels, frames, and
content bounds
([v2.16 changelog](https://github.com/tt-a1i/archify/blob/v2.16.0/CHANGELOG.md#2160--2026-08-30),
[`workflow-compiler.mjs`](https://github.com/tt-a1i/archify/blob/c826e6c3a7abad19c0f3cd1ca57207d54b1ad8de/archify/renderers/workflow/workflow-compiler.mjs)).
It is a constraint compiler for one typed grammar, not general architecture auto-layout.

Archboard can preserve the author's coarse structure, then make mechanical spacing and routing
deterministic. Here that coarse structure is the current board itself, including
human rearrangement; adding persistent rank/lane metadata would be a new model with no demonstrated
need.

### 3. Routing uses stable candidates; workflow enforces hard feasibility

The architecture router assigns deterministic side anchors and spreads shared ports, then tries a
bounded family of straight, midpoint dogleg, side-aware bridge, and outside-channel routes in a
stable order. It accepts passing candidates where available. Two deliberate exceptions matter: the
near-axis direct fast path checks endpoint direction but not obstacles, and the historical fallback
may return a route that still violates an obstacle or endpoint direction rule. The shared validator
reports those failures
([`render-architecture.mjs`](https://github.com/tt-a1i/archify/blob/c826e6c3a7abad19c0f3cd1ca57207d54b1ad8de/archify/renderers/architecture/render-architecture.mjs#L829-L902)).

The workflow compiler is the stronger model. For automatic edges it explores side pairs and nine
route families. Hard checks reject paths that violate endpoint direction, node/label/frame
clearance, route rhythm, or canvas bounds. Feasible candidates are compared in a fixed order:
forward-edge reversal, proper crossings, shared corridor length, label-route deficit, short
interior segments, bends, Manhattan stretch, canvas growth, port displacement, legacy displacement,
then a stable ordinal. If no bounded candidate works, it returns the typed
`workflow/solver-budget-exhausted` failure instead of searching indefinitely. The failure reports
the attempted candidate families and candidate count, but its `supportedFixes` list is empty
([`workflow-compiler.mjs`](https://github.com/tt-a1i/archify/blob/c826e6c3a7abad19c0f3cd1ca57207d54b1ad8de/archify/renderers/workflow/workflow-compiler.mjs#L3445-L3461)).

The particular dogleg formula is less interesting than the split between hard semantic feasibility
and stable visual preference. The workflow search has an explicit budget and typed exhaustion
evidence. Final exhaustion does not currently offer a supported repair.

### 4. Validation is part of authoring, but it is not visual truth

Archify validates after edits and before delivery. Showcase validation combines schema/layout
checks with nine artifact checks: one finite SVG, orthogonal arrows, label-to-route clearance,
relationship crossings and corridors, container-border runs, route rhythm, and legend clearance.
It records a composition receipt, while `deliver` stages a candidate and atomically replaces the
last-good artifact only after validation. Browser evidence checks first-screen containment at four
desktop sizes, then keeps perceptual review a separate human/agent decision.

I ran the current development CLI against its canonical 10-component web-app architecture example:
`validate --quality showcase --json` passed 9/9 with zero errors or warnings, and `inspect --json`
returned the computed component, boundary, connection, label, and view-box geometry. These commands
were read-only and produced no repository artifact.

The gates still have important blind spots. Open reports show an unnecessary port-spread dogleg
([#137](https://github.com/tt-a1i/archify/issues/137)), about 25 manual repair rounds for an
8-node/10-edge architecture map ([#214](https://github.com/tt-a1i/archify/issues/214)), a clipped
edge label that passes 9/9 ([#235](https://github.com/tt-a1i/archify/issues/235)), and two
anti-parallel, explicitly labelled edges collapsing into one accepted line
([#248](https://github.com/tt-a1i/archify/issues/248)). Development head also has a clean-receipt
sequence-title overflow ([#297](https://github.com/tt-a1i/archify/issues/297)). Conversely, closed
issue [#24](https://github.com/tt-a1i/archify/issues/24) is strong evidence for the value of a hard
edge-through-unrelated-node rule: the hidden segment made a connection visually appear to originate
at the wrong component.

Deterministic checks make repair tractable, but a clean receipt is only as credible as its obstacle
model. Archboard's own skill already says that check evidence is not a substitute for composition
or human read-back. It should keep that distinction.

### 5. The visual system helps, but it belongs to a different product

Archify draws a self-contained, read-only HTML/SVG artifact with fixed typography, semantic color
classes, small role sigils, masks behind labels, arrows below opaque nodes, themes, and crisp export.
Those choices produce polish and make final SVG checking straightforward. They are not the main
transfer target. Archboard's product is a mutable Excalidraw note with a human in the loop; replacing
its sketch-like, editable elements with one generated SVG would remove element-level rearrangement,
read-back, promotion, bindings, and code metadata.

## Where the mechanism fits

Archboard already has most of the receiving pipeline:

| Archboard part                                                                                                          | Current behavior                                                                                                        | Consequence for this research                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`engine/layout.ts`](../../src/runtime/engine/layout.ts)                                                                | Describes proximity clusters, bounds, and relative regions for read-back. It does not place elements.                   | Do not turn a descriptive reader into a hidden layout writer.                                        |
| Mermaid conversion in [`board-rendering`](../../src/server/board-rendering/)                                            | The only imported auto-layout path enters through the one inbound converter and persists canonical Excalidraw elements. | A connector planner should return ordinary element replacements, not another document format.        |
| [`board-inspection`](../../src/runtime/board-inspection/) and [`check.ts`](../../src/cli/commands/check.ts)             | Pure, browser-free inspection reports typed geometry findings and strict exit states.                                   | Reuse its public report as the feasibility gate. Fix its known text-obstacle gap first.              |
| [`measure-text.ts`](../../src/runtime/engine/measure-text.ts)                                                           | Measures the pinned Excalidraw fonts to browser precision.                                                              | Archboard can test label and text obstacles more accurately than Archify's character-unit estimates. |
| [`board-io.ts`](../../src/runtime/engine/board-io.ts) and [`atomic-write.ts`](../../src/runtime/engine/atomic-write.ts) | The note is canonical and one requested change reaches one synchronous atomic write under the board contract.           | Plan and inspect a complete candidate in memory, then write once or not at all.                      |
| [`board-rendering`](../../src/server/board-rendering/) and finding close-ups                                            | Render persisted board state without borrowing a person's browser.                                                      | Use rendered output for visual review without making it the geometry planner.                        |

## Ranked Archboard adaptations

### 1. Execute TASK-146: make text a routing obstacle

**Value and need.** Device-trust proposal boards exposed 11 connector-through-text intersections
per board while `archboard check --strict` reported complete and clean. That is a current reachable
failure, not a speculative input. Correct detection improves agent completion confidence and the
human's ability to read labels. Archify's history independently shows that a line disappearing
through unrelated content can communicate false topology.

**Smallest change.** Keep routing repair manual, as TASK-146 already specifies. Extend
`src/runtime/board-inspection/` so supported connector segments test unrelated standalone text
bounds, excluding the connector's own bound label and endpoint-owned text. Add the typed finding to
`schemas.ts`, detector and text formatting, and existing finding rendering. Do not add a generic
details bag, a second geometry implementation, or a browser dependency.

**Direct verification.** The focused `inspectBoard` owner should cover horizontal, vertical,
negative-relative, tolerance, and exemption cases, including a reduced device-trust fixture. The
existing CLI contract should prove strict exit status; existing finding rendering should prove the
new focus box. This is stable module/CLI behavior, so a new broad browser owner would be wasteful.

### 2. Spike an explicit, targeted connector-route planner

**Value and need.** People repaired the observed text collisions manually, but the repository does
not record how many edit/check batches that took. Archify's route candidate model might reduce that
work. Its unresolved convergence and shared-port defects show why Archboard should prove the
mechanism before adding a permanent command or module.

**Smallest experiment.** Add no command in the spike. A pure proposed
`src/runtime/connector-routing/` module should accept an inert board snapshot and named connector
IDs, preserve every node and text position, and emit replacement candidates only. Generate a small
stable family from current, straight, horizontal-first, vertical-first, and obstacle-edge channels.
Use the public `inspectBoard` result as the hard feasibility oracle after TASK-146. Compare each
candidate with an inspection of the inert input board. A candidate is feasible when inspection
coverage remains complete for the supported target geometry, the selected connectors' target
findings disappear, and the candidate adds no finding relative to that baseline. Unrelated existing
findings do not make the route impossible. Rank feasible candidates only by non-hard preferences:
bends, length/stretch, displacement from the current path, then stable candidate ordinal. Bound
both the candidate count and repair rounds; report no feasible route with measured obstacles rather
than moving a node.

The spike's machine-observable gate is one computed replacement set making each isolated reduced
real fixture strict-clean without moving non-target content, with stable output under input
reordering. Passing that gate does not prove a reduction in human repair batches. If the proxy and
rendered review justify a product command, expose it as an explicit `arrange route` operation for
named connectors, compute the complete candidate board before writing, and send one replacement
batch through the existing one-write boundary. Claim/progress remains visible while computing.
Human-authored layout is never routed implicitly, and a failed plan writes nothing.

**Direct verification.** Reuse reduced real-board fixtures, not synthetic topology classes. Assert
strict-dirty before and strict-clean after on each isolated target fixture; byte/field equality for
every non-target element; stable connector IDs and bindings; deterministic output under reordered
input; and complete supported-geometry coverage. Add a case with an unrelated baseline finding and
prove the route removes its target finding without adding another one or requiring the whole board
to become clean. If a command follows, prove one public write and no new unsupported-geometry claim.
Render the accepted board through `archboard render` for direct visual review. Only add a browser
owner if a browser round trip changes the produced connector, because the stable contract is board
geometry, inspection, and one write.

Automatic port reassignment should be a later, separately proved extension. Archboard bindings use
Excalidraw's `focus` and `gap`, and a person's rebinding is authored state. Port movement therefore
needs differential evidence against the pinned Excalidraw behavior and must never be folded casually
into the first routing slice.

## Mechanisms to reject

| Mechanism                                                     | Decision | Reason                                                                                                                                                                               |
| ------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General architecture auto-layout or topology classification   | Reject   | Archify does not provide it, and Archboard has no evidence that replacing human arrangement improves the live read-back loop.                                                        |
| Archify's typed JSON IR and per-diagram renderers             | Reject   | This would create another canonical document and converter beside the Excalidraw note, violating the one-board model.                                                                |
| Generated SVG as an Archboard node or whole-board replacement | Reject   | It is visually polished but destroys element-level editing, bindings, metadata, promotion, and spatial read-back.                                                                    |
| Responsive/mobile topology                                    | Reject   | Archboard's shell contract is desktop-only; Samsung Flip support is a large desktop touch target, not a phone layout.                                                                |
| Copying Archify's approximate text units                      | Reject   | Archboard already measures the pinned Excalidraw fonts to browser precision in `src/runtime/engine/measure-text.ts`; replacing that with character heuristics would weaken geometry. |
| Treating a clean checker receipt as visual approval           | Reject   | Both projects have reachable clean-but-bad examples. Keep rendered review and human interpretation explicit.                                                                         |
| Hidden automatic tidy after a human edit                      | Reject   | A moved box is design intent. Any mechanical routing must be explicit, targeted, inspectable, and atomic.                                                                            |

## Evidence quality and limits

| Evidence                                                                                                  | Quality                         | Limit                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable tag, release manifest, package metadata, skill, renderers, compiler, schemas, tests, and changelog | High; primary, immutable source | Describes implementation and declared contracts, not independent aesthetic preference.                                                                                    |
| Local execution of canonical `validate` and `inspect` example at development head                         | High for CLI behavior observed  | One maintained example cannot establish quality across arbitrary graphs.                                                                                                  |
| Archify's Mermaid experiment                                                                              | Medium                          | It records a preregistered direction but only the owner's self-evaluation; after provenance cleanup, the original five-input threshold cannot be rerun from current HEAD. |
| Archify issue reproductions and receipts                                                                  | Medium to high                  | Concrete and often machine-reproducible, but mostly reporter evidence rather than an independent benchmark.                                                               |
| Archboard source, design docs, Backlog TASK-146, and device-trust geometry cited by that task             | High for local product need     | No existing benchmark measures how often a route planner would succeed or how many repair batches it would save.                                                          |

Unknowns to resolve in the routing spike are Excalidraw's behavior for multi-segment arrows after a
human round trip, which connector geometries can be promised without expanding inspection coverage,
and whether candidate routing succeeds often enough on real Archboard boards to repay a new module
and command. Those unknowns are why the report recommends one existing checker fix and one bounded
experiment, not a new layout subsystem.
