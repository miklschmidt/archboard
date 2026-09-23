---
status: accepted
---

# Semantic boards own meaning; renderers own presentation

Human drawing edits have primarily repaired agent layout and organization mistakes.
Agents repeatedly produce diagrams with weak visual and typographic hierarchy.
The replacement board model will express architectural meaning and presentation
intent, with geometry and styling owned by the renderer so one improvement can
benefit every board. These product boundaries were agreed during TASK-169 on
2026-09-11; the schema, renderer choice, and implementation approach remain under
design.

## Agreed boundaries

- Each board owns its content independently. Variants remain explicit; this change
  does not introduce a shared architecture database whose edits propagate across boards.
- One versioned JSON document contains a board's variant tree, views, ancestry,
  and current designation. One atomic write records a parent edit, nonconflicting
  propagation, and unresolved conflicts together. Claims and version checks cover
  the whole board rather than individual variants. Separate boards remain independent.
- Define the canonical contract in Zod, deriving TypeScript types from it. Reuse
  compatible PR Lens Zod definitions and adapt the contract to Archboard's domain.
  JSON Schema can be generated from the combined Zod schema when needed; it is not
  a second hand-maintained contract. Zod is already a repository dependency.
- A board can have several named views sharing its nodes. Each view selects a
  grammar and the content it explains; the frontend may switch between views or
  display them together. Views are distinct from the linked boards at other levels.
  Views belong to the board: every variant exposes the same named readings,
  grammar and scope. A variant supplies the content for a reading; selecting a
  different variant preserves the selected view. Absent subjects yield an empty
  or partial reading, rather than a different menu. Walkthroughs belong to each
  variant's semantic content and may differ between proposals. Narrative or view
  changes alone do not badge architectural nodes as changed.
  This ownership was revised on 2026-09-13 after dogfooding showed that variant-owned
  views changed the question during comparison. The unpublished branch deliberately
  breaks the old board format; authored boards are repaired without a compatibility layer.
- A board describes one diagram or architectural question. Its semantic name
  describes that subject; repository paths belong in code bindings. Variants
  record the diagram's evolution and appear as an ancestry tree in navigation.
- Compare variants deterministically using stable architectural identities. Rendered
  views show added, removed, and changed content using derived labels and visual
  treatment; agents do not author those change flags. A proposal's change labels
  are part of its ordinary rendering rather than a separately requested comparison
  mode. Variants form a tree, with one predecessor per variant: B derived from A
  shows its changes relative to A, and A may have competing children B and C.
  A child's baseline follows its evolving parent, rather than staying pinned to
  the parent's branching-time content. Automatic inheritance applies only to
  draft proposals: adoption preserves ancestry but stops automatic inheritance
  from the predecessor. Current architecture changes through explicit edits, and
  historical states remain frozen. Parent changes that break a child must be
  visible in the rendered viewer. Nonconflicting parent changes flow into children
  automatically while preserving each child's own changes. Conflicting edits and
  broken references remain explicit unresolved issues; neither side silently wins.
  Reconcile individual fields using stable entity identities: independent fields
  merge, identical changes agree, and incompatible changes to the same field conflict.
  Conflicting changes to flow or walkthrough order require resolution rather than
  an inferred order.
  Retain the child's last coherent rendering, visibly mark its need for reconciliation,
  and highlight affected subjects. The engine detects conflicts and the viewer
  presents them. The command that edited the parent returns affected descendants,
  issues, and actionable guidance/instructions to the same agent so it can resolve
  them. A frontend resolve-with-agent action is not required: the frontend does not
  author content. A valid parent edit commits together with safe descendant updates
  and conflict records in one atomic write. Its result explicitly distinguishes
  'applied; reconciliation required' from rejection, includes affected variants and
  repair instructions, and tells the agent to resolve issues rather than retry an
  already-applied parent edit.
  Every state has a lasting name; `current` is a movable designation, not the
  state's identity. Adopting a state moves that designation, preserves the former
  current under its original name, and records when adoption occurred. On a board
  that has no current variant there is no former current: adoption is the moment
  its architecture starts existing, and nothing becomes history
  ([ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)). Proposal
  ancestry and adoption history are distinct. Adoption is explicit once a variant
  describes implemented architecture; leadership approval alone keeps it a proposal.
  An agent may adopt when instructed, but rendering or merging code does not
  automatically move `current`. Draft proposals and the current state
  may evolve, but a formerly current state is frozen as history. Historical corrections
  would require an explicit operation outside ordinary editing; that mechanism is
  deferred until a real need arises. Any coherent draft, including a competing branch,
  may be explicitly adopted without reparenting. Unresolved reconciliation refuses
  adoption. The actual ancestry and the adoption transition are recorded separately.
  Removed content comes from the comparison baseline for the derived depiction; it is not
  reinserted into the proposal's authored content. The existing comparison
  implementation must be assessed against the new semantic schema rather than
  assumed reusable unchanged. Badge the entity whose semantic properties changed;
  changing an edge does not automatically badge its endpoint nodes as changed.
  Changes to renderer geometry, styling, or bookkeeping do not count as changes
  to architecture.
- Agents may express containment, ordered flows, focal subjects, diagram grammar,
  and the order in which nodes and relationships enter layout. Their numeric
  `order` is persistent authoring intent, assigned automatically in 1000-step
  document order when absent so agents can later adjust the picture.
  They do not author coordinates, font sizes, colours, or connector routes.
- Fork/adapt PR Lens and inherit both supported grammars: architecture and its
  message-sequence grammar named data-flow. The user chose PR Lens after visually
  comparing the candidates and preferred its clarity and finish. Its existing
  ownership of geometry also matches the agreed authoring contract.
- Maintain the adapted PR Lens source inside this repository, preserving its license
  and originating revision. Schema, renderer, and engine changes share a verification
  workflow; no separate repository or package release pipeline is required. Take
  useful upstream changes deliberately.
- Support a narrative walkthrough for explaining architecture to leadership:
  explanatory text alongside the diagram, with scrolling through the narrative
  highlighting its subjects. PR Lens provides walkthrough schema and focus geometry,
  but its hosted narrative viewer is not in the open-source renderer. Archboard's
  viewer must supply this interaction. Agents author optional ordered headings,
  explanations, target views, and focused node/edge identities. The viewer owns
  scrolling, highlighting, transitions, and typography.
- Nodes may contain other nodes, with one structural parent per node. Containment
  describes architecture rather than a special drawing shape. Abstraction levels
  remain separate linked boards: a system board shows services, and a service board
  shows its modules. This does not require one recursively expanded canvas.
- Drill-down links name an explicit target board and variant. Variant names need
  not match across levels. The target's movable `current` designation is used only
  when explicitly requested; missing named targets never fall back to it silently.
- Historical preservation is per board. Drill-down opens the explicit target with
  its current/proposed/historical status visible; use an explicitly historical
  target when historical detail is required. Automatic snapshots spanning boards
  are deferred.
- A node has a name, an optional short responsibility, and an optional detailed
  description. The name and responsibility receive consistent visual hierarchy;
  longer descriptions are available through inspection.
- A node has at most one optional primary code binding. Nodes on the same board
  may bind to different repositories. A node is planned because of the variant it
  is on, never because of what it lacks: a missing binding means nothing has been
  bound, not that nothing was built
  ([ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)).
- People explore through selection, inspection, code navigation, pan and zoom, and
  agent requests grounded in selected nodes. Content changes are initially made
  through agents; a direct manipulation editor is not a delivery requirement.
- Large renderings are acceptable. The viewer supports navigation across the board;
  fitting the whole diagram in one viewport is not a success criterion. Do not add
  size-driven refusal, automatic partitioning, or a density policy before an observed
  problem requires one. No particular layout failure policy has been selected.
- Drop native Obsidian compatibility. Preserve existing board files without rewriting
  or deleting them. Migration mechanisms are deferred and are not part of this work.

## First complete validation example

Use this feature's architecture: the existing Excalidraw board pipeline versus the
proposed semantic-board pipeline. Author new semantic boards without migrating old
files. Show architecture and an agent-edit sequence, with a leadership walkthrough,
then exercise competing branches, a parent change, a conflict, and adoption. This
example verifies both visual quality and variant lifecycle behavior against a real
change the user is planning.

## Relationship to existing decisions

This replaces the Excalidraw foundation in ADR 0001, the element-metadata model in
ADR 0003, and the Obsidian-specific requirements in ADR 0004 for the new board model.
It replaces ADR 0015's choice of Excalidraw elements as the canonical representation,
while retaining one authoritative persisted board rather than two writable formats.
ADR 0022's direct human drawing workflow is not required in the replacement viewer.
The legacy implementation still follows those earlier contracts until replaced.

The Archify and PR Lens investigations remain source evidence, but recommendations
based on preserving human geometry no longer govern this design. Removing a drawing
engine does not require removing semantic identity or code bindings: those belong to
the board and its nodes, independently of their graphical representation.

[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md)
supersedes two paragraphs above: the architecture layout is ELK with reading
conventions the renderer owns rather than PR Lens's grid, and a layout change is
measured by fit in the reference pane together with reader invariants, which
replaces the clauses that fitting one viewport is not a success criterion and
that no density policy is wanted. It also records that the list of what agents
may not author is exactly the list above.

## Where a picture is drawn (TASK-247, 2026-09-17)

The board file stays the one source of truth, and the browser stays a viewer
that writes nothing. Drawing a picture in the browser does not change either.
The user clarified on 2026-09-16 that a browser may hold a board's content as a
read-only cache of what the server said. The server invalidates that cache by
announcing the board's new version, as it already does for the pictures it
serves. Nothing in the browser edits, merges or answers for that content, and
no picture of it is shown without first being checked against the version the
server reports.

So the canvas draws its pictures in the page with the same renderer core the
CLI and the render route run. Text is measured by the canvas of whatever
draws, so a picture measured in one browser matches what that browser paints
and may differ from another browser's. Pictures are kept in the browser's
storage, stamped with the board version, the vault policy fingerprint and the
renderer build. On page load, entries are checked against the server's board
list, and a board's pictures are drawn again in the background when its
change is announced. The render route remains for the CLI, rasterizing and
anything else without a renderer of its own.

## A walkthrough is presented, not scrolled (TASK-250, 2026-09-17)

The walkthrough boundary above still holds: agents author the ordered steps,
their subjects and their views, and the viewer owns every interaction with
them. What changed is that interaction. Scrolling a column of text to move
between steps put the step on screen at the mercy of where the text happened
to sit, and the user wants a walkthrough to be something a voice agent can
present. So the viewer presents it: the step's heading and words are set in
the picture's frame, the reader steps explicitly (keys, controls, or choosing a
step), the camera glides to the step while what it is not about recedes, and
leaving returns the camera and view the reader had. The pane exposes which step
is on screen and whether it has finished arriving, so something driving the
presentation can wait for it. Nothing about a walkthrough is written by
presenting it.

## A narrator asks for a step; the pane says where it is (TASK-251, 2026-09-20)

A voice agent narrating a walkthrough drives the presentation without taking
the position from the browser. The canvas sends a pane `pane_present`, which is
one more way of choosing a step beside the keys and the controls, and the next
thing a person does replaces it. The pane's semantic report gains where a
presented walkthrough has got to: the walkthrough, the beat, how many there
are, whether the beat has finished arriving, and which request the position
answers, or none when a person chose it. That report is read-only telemetry, in
the same class as the view and the selection it already carries, and it is the
only acknowledgement there is: a narrator is told a step is on screen because
the pane said so, never because the canvas asked for it. A position no request
put there is a person's hand, and the narrator is told so that the narration
follows the picture. Nothing about a walkthrough is written by narrating it.

Since 2026-09-23 no narrator asks for steps: the user steps by hand. The canvas
sends `pane_present` once, to open the first step when Narrate is pressed, and
every position the pane then reports is what the voice model is told.

## Delivery

The later TASK-203 decisions refine consumer vocabulary and appearance in
[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md),
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md), and
[ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md).
Their acceptance records product decisions; implementation of that work remains
subject to completing the TASK-203 plan.
The TASK-245 decisions on reading direction and the fit measure are in
[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md).

The product decisions above were accepted through Q34 of the TASK-169 interview.
The accepted implementation design is in
[semantic-boards-implementation.md](../design/semantic-boards-implementation.md),
with the spec in TASK-170 and delivery tickets TASK-171 through TASK-181. The user
explicitly pre-approved the implementation approach and breakdown and authorized
autonomous implementation using Claude Opus 5 through herdr.
