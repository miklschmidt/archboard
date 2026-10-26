---
status: accepted
---

# Semantic boards own meaning, and renderers own presentation

[ADR 0058](0058-canonical-model-reads-keep-legacy-authority-explicit.md) replaces independent board ownership for authored canonical models.
Legacy vaults retain the board document and variant contracts below until explicit migration.

Amended by [ADR 0051](0051-a-person-can-move-a-board-to-another-repository.md)
(2026-10-14). The browser moves a board when a person asks it to. That is the
one board write a browser makes besides a take-back. Everything else stands.

The user amended this ADR in a decision of 2026-09-27. What a variant is drawn
against is the board's current variant, not its predecessor. The user's words
were: "Diff should be on 'historical' and not 'current', when a board has
historical boards. Current is now, backwards (historical) / forwards
(proposals/drafts) is always diffed against 'current', not the other way
around."

The current variant is the reference and shows no comparison. A historical,
draft or shelved variant is drawn, inspected, narrated and compared as how it
differs from the current one. Its added subjects are the ones only it has. Its
removed subjects are the ones only current has. A board with no current variant
has no now. On such a board, each draft is still read against the one it came
from.

The ancestry is unchanged. Reconciliation, inheritance and adoption (ADR 0037)
still follow the parent. `semantic compare --against` reads a variant against
any other. That is how a superseded proposal is read for its own change. The
comparison bullet below says so, and everything else stands.

Human drawing edits mostly repaired agent layout and organization mistakes.
Agents repeatedly produce diagrams with weak visual and typographic hierarchy.
The replacement board model will express architectural meaning and presentation
intent. The renderer owns geometry and styling, so one improvement can benefit
every board. These product boundaries were agreed during TASK-169 on 2026-09-11.
The schema, renderer choice, and implementation approach remain under design.

## Agreed boundaries

- Each board owns its content independently. Variants remain explicit. This
  change does not introduce a shared architecture database whose edits propagate
  across boards.
- One versioned JSON document contains a board's variant tree, views, ancestry,
  and current designation. One atomic write records a parent edit,
  nonconflicting propagation, and unresolved conflicts together. Claims and
  version checks cover the whole board rather than individual variants. Separate
  boards remain independent.
- Define the canonical contract in Zod. Derive TypeScript types from it. Reuse
  compatible PR Lens Zod definitions. Adapt the contract to Archboard's domain.
  When needed, JSON Schema can be generated from the combined Zod schema. It is
  not a second hand-maintained contract. Zod is already a repository dependency.
- A board can have several named views that share its nodes. Each view selects a
  grammar and the content it explains. The frontend can switch between views or
  display them together. Views are distinct from the linked boards at other
  levels.
- Views belong to the board. Every variant exposes the same named readings,
  grammar and scope. A variant supplies the content for a reading. Selecting a
  different variant preserves the selected view. Absent subjects yield an empty
  or partial reading instead of a different menu.
- Walkthroughs belong to each variant's semantic content and can differ between
  proposals. Narrative or view changes alone do not badge architectural nodes as
  changed.
- This ownership was revised on 2026-09-13 after dogfooding (using archboard on
  itself) showed that variant-owned views changed the question during
  comparison. The unpublished branch deliberately breaks the old board format.
  Authored boards are repaired without a compatibility layer.
- A board describes one diagram or architectural question. Its semantic name
  describes that subject. Repository paths belong in code bindings. Variants
  record the diagram's evolution and appear as an ancestry tree in navigation.
- Compare variants deterministically using stable architectural identities.
  Rendered views show added, removed, and changed content using derived labels
  and visual treatment. Agents do not author those change flags.
- A proposal's change labels are part of its ordinary rendering rather than a
  separately requested comparison mode. Variants form a tree, with one
  predecessor per variant. A can have competing children B and C. Every variant
  but the current one shows how it differs from the current variant. On a board
  with no current variant, B derived from A shows its changes relative to A
  (amended 2026-09-27, above).
- A child's baseline follows its evolving parent. It does not stay pinned to the
  parent's branching-time content. Automatic inheritance applies only to draft
  proposals. Adoption preserves ancestry but stops automatic inheritance from
  the predecessor. Current architecture changes through explicit edits, and
  historical states refuse ordinary edits. TASK-509 adds the narrow correction
  path below.
- Parent changes that break a child must be visible in the rendered viewer.
  Nonconflicting parent changes flow into children automatically while
  preserving each child's own changes. Conflicting edits and broken references
  remain explicit unresolved issues. Neither side silently wins.
- Reconcile individual fields using stable entity identities. Independent fields
  merge, identical changes agree, and incompatible changes to the same field
  conflict. Conflicting changes to flow or walkthrough order require resolution
  rather than an inferred order.
- Retain the child's last coherent rendering. Visibly mark its need for
  reconciliation, and highlight affected subjects. The engine detects conflicts
  and the viewer presents them.
- The command that edited the parent returns affected descendants, issues, and
  actionable guidance/instructions to the same agent so that it can resolve
  them. A frontend resolve-with-agent action is not required, because the
  frontend does not author content.
- A valid parent edit commits together with safe descendant updates and conflict
  records in one atomic write. Its result explicitly distinguishes 'applied;
  reconciliation required' from rejection. The result includes affected variants
  and repair instructions. It tells the agent to resolve issues rather than
  retry an already-applied parent edit.
- Every state has a lasting name. `current` is a movable designation, not the
  state's identity. Adopting a state moves that designation, preserves the
  former current under its original name, and records the time of adoption.
- On a board that has no current variant, there is no former current. Adoption
  is the moment its architecture starts existing, and nothing becomes history
  ([ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)).
  Proposal ancestry and adoption history are distinct.
- Adoption is explicit once a variant describes implemented architecture.
  Leadership approval alone keeps it a proposal. An agent can adopt on
  instruction, but rendering or merging code does not automatically move
  `current`.
- Draft proposals and the current state can evolve, but a formerly current state
  is frozen as history. Historical corrections will require an explicit
  operation outside ordinary editing. That mechanism is deferred until a real
  need arises.
- Any coherent draft, including a competing branch, can be explicitly adopted
  without reparenting. Unresolved reconciliation refuses adoption. The actual
  ancestry and the adoption transition are recorded separately.
- Removed content comes from the comparison baseline for the derived depiction.
  The baseline is the current variant, or on a board with none the predecessor.
  Removed content is not reinserted into the proposal's authored content.
- The existing comparison implementation must be assessed against the new
  semantic schema rather than assumed reusable unchanged. Badge the entity whose
  semantic properties changed. Changing an edge does not automatically badge its
  endpoint nodes as changed. Changes to renderer geometry, styling, or
  bookkeeping do not count as changes to architecture.
- Agents can express containment, ordered flows, focal subjects, diagram
  grammar, and the order in which nodes and relationships enter layout. Their
  numeric `order` is persistent authoring intent. Absent values are assigned
  automatically in 1000-step document order, so agents can later adjust the
  picture. Agents do not author coordinates, font sizes, colors, or connector
  routes.
- Fork/adapt PR Lens and inherit both supported grammars: architecture and its
  message-sequence grammar named data-flow. The user compared the candidates
  visually and chose PR Lens. The user preferred its clarity and finish. Its
  existing ownership of geometry also matches the agreed authoring contract.
- Maintain the adapted PR Lens source inside this repository. Preserve its
  license and originating revision. Schema, renderer, and engine changes share a
  verification workflow. No separate repository or package release pipeline is
  required. Take useful upstream changes deliberately.
- Support a narrative walkthrough for explaining architecture to leadership. It
  has explanatory text alongside the diagram. Scrolling through the narrative
  highlights its subjects.
- PR Lens provides walkthrough schema and focus geometry. Its hosted narrative
  viewer is not in the open-source renderer. Archboard's viewer must supply this
  interaction. Agents author optional ordered headings, explanations, target
  views, and focused node/edge identities. The viewer owns scrolling and
  highlighting. It also owns transitions and typography.
- Nodes can contain other nodes, with one structural parent per node.
  Containment describes architecture rather than a special drawing shape.
  Abstraction levels remain separate linked boards. A system board shows
  services, and a service board shows its modules. This does not require one
  recursively expanded canvas.
- Drill-down links name an explicit target board and variant. Variant names need
  not match across levels. The target's movable `current` designation is used
  only on explicit request. Missing named targets never fall back to it
  silently.
- Historical preservation is per board. Drill-down opens the explicit target
  with its current/proposed/historical status visible. If historical detail is
  required, use an explicitly historical target. Automatic snapshots spanning
  boards are deferred.
- A node has a name, an optional short responsibility, and an optional detailed
  description. The name and responsibility receive consistent visual hierarchy.
  Longer descriptions are available through inspection.
- A node has at most one optional primary code binding. Nodes on the same board
  can bind to different repositories. A node is planned because of the variant
  it is on, never because of what it lacks. A missing binding means nothing is
  bound, not that nothing was built
  ([ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)).
- People explore through selection, inspection, code navigation, pan and zoom,
  and agent requests grounded in selected nodes. Initially, agents make content
  changes. A direct manipulation editor is not a delivery requirement.
- Large renderings are acceptable. The viewer supports navigation across the
  board. Fitting the whole diagram in one viewport is not a success criterion.
  Do not add size-driven refusal, automatic partitioning, or a density policy
  before an observed problem requires one. No particular layout failure policy
  is selected.
- Drop native Obsidian compatibility. Preserve existing board files without
  rewriting or deleting them. Migration mechanisms are deferred and are not part
  of this work.

## First complete validation example

Use this feature's architecture: the existing Excalidraw board pipeline versus
the proposed semantic-board pipeline. Author new semantic boards without
migrating old files. Show architecture and an agent-edit sequence, with a
leadership walkthrough. Then exercise competing branches, a parent change, a
conflict, and adoption. This example makes sure that both visual quality and
variant lifecycle behavior work against a real change the user is planning.

## Relationship to existing decisions

This replaces three things for the new board model. They are the Excalidraw
foundation archboard started on, the element-metadata model in ADR 0003, and the
Obsidian-specific requirements in ADR 0004. It replaces ADR 0015's choice of
Excalidraw elements as the canonical representation. It retains one
authoritative persisted board rather than two writable formats. ADR 0022's
direct human drawing workflow is not required in the replacement viewer. The
legacy implementation still follows those earlier contracts until the new
implementation replaces it.

The Archify and PR Lens investigations remain source evidence. Recommendations
based on preserving human geometry no longer govern this design. Removing a
drawing engine does not require removing semantic identity or code bindings.
Those belong to the board and its nodes, independently of their graphical
representation.

[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md)
supersedes two paragraphs above. The architecture layout is ELK with reading
conventions that the renderer owns, rather than PR Lens's grid. A layout change
is measured by fit in the reference pane together with reader invariants. This
replaces the clauses that fitting one viewport is not a success criterion and
that no density policy is wanted.

ADR 0028 also records that the list of what agents must not author is exactly
the list above. [ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md)
in turn makes fit a guideline. A drawing is measured first by how easily it
reads.

## Where a picture is drawn (TASK-247, 2026-09-17)

The board file stays the one source of truth. The browser stays a viewer that
writes nothing. Drawing a picture in the browser does not change either. The
user clarified on 2026-09-16 that a browser can hold a board's content as a
read-only cache of what the server said. The server invalidates that cache by
announcing the board's new version, as it already does for the pictures it
serves.

Nothing in the browser edits, merges or answers for that content. The browser
shows no picture of it without first making sure that the picture matches the
version the server reports.

So the canvas draws its pictures in the page with the same renderer core that
the CLI and the render route run. The canvas of whatever draws measures text. A
picture measured in one browser matches what that browser paints. It can differ
from another browser's.

The browser keeps pictures in its storage, stamped with the board version, the
vault policy fingerprint and the renderer build. On page load, the browser makes
sure that each entry matches the server's board list. When the server announces
a board's change, the browser draws that board's pictures again in the
background. The render route remains for the CLI, rasterizing and anything else
without a renderer of its own.

## A walkthrough is presented, not scrolled (TASK-250, 2026-09-17)

The walkthrough boundary above still holds. Agents author the ordered steps,
their subjects and their views. The viewer owns every interaction with them.
What changed is that interaction. Scrolling a column of text to move between
steps put the step on screen at the mercy of where the text happened to sit. The
user wants a walkthrough to be something a voice agent can present.

So the viewer presents it. The viewer sets the step's heading and words in the
picture's frame. The reader steps explicitly (keys, controls, or choosing a
step). The camera glides to the step while what it is not about recedes. Leaving
returns the camera and view the reader had.

The pane exposes which step is on screen and whether it finished arriving, so
that something driving the presentation can wait for it. Nothing about a
walkthrough is written by presenting it.

## A narrator asks for a step, and the pane says where it is (TASK-251, 2026-09-20)

A voice agent narrating a walkthrough drives the presentation without taking the
position from the browser. The canvas sends a pane `pane_present`. It is one
more way of choosing a step, beside the keys and the controls. The next thing a
person does replaces it.

The pane's semantic report gains the position of a presented walkthrough. The
position consists of these parts:

- The walkthrough
- The step
- How many there are
- Whether the step finished arriving
- Which request the position answers, or none for a position that a person chose

That report is read-only telemetry, in the same class as the view and the
selection it already carries. It is the only acknowledgement there is. A
narrator learns that a step is on screen because the pane said so, never because
the canvas asked for it. A position that no request put there is a person's
hand. The narrator learns this, so that the narration follows the picture.
Narrating a walkthrough writes nothing about it.

Since 2026-09-23, no narrator asks for steps. The user steps by hand. When the
user presses Narrate, the canvas sends `pane_present` once, to open the first
step. The voice model is told every position that the pane then reports.

## Delivery

The later TASK-203 decisions refine consumer vocabulary and appearance in
[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md),
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md), and
[ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md). Their
acceptance records product decisions. Implementation of that work remains
subject to completing the TASK-203 plan. The TASK-245 decisions on reading
direction and the fit measure are in
[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md).

The product decisions above were accepted through Q34 of the TASK-169 interview.
The accepted implementation design is in
[semantic-boards-implementation.md](../design/semantic-boards-implementation.md),
with the spec in TASK-170 and delivery tickets TASK-171 through TASK-181. The
user explicitly pre-approved the implementation approach and breakdown. The user
also authorized autonomous implementation using Claude Opus 5 through herdr.

## Historical corrections (TASK-509)

A historical variant records an architecture that existed. Its diagram can
still contain a mistake. Correcting that description does not change which
architecture existed or which variant succeeded it.

Ordinary edits still refuse historical content. `semantic correct` accepts an
explicit correction with a reason and immutable Git commits for every
repository that its bindings, anchors or documents reference. A preview reads
the candidate against those Git trees, including when a commit equals HEAD.
Local edits never supply historical evidence. The write repeats that reading
and refuses code warnings before the normal lease and expected-version boundary
commits the checked candidate.

The correction keeps the variant's identity, ancestry, lifecycle and adoption
records. Content corrections flow into inheriting drafts through the normal
three-way merge. Drafts keep their own changes, and conflicts remain visible. Propagation
stops at current, historical and shelved successors. Shared views and board
level stay unchanged. The variant
records each correction's time, reason and repository commits. The code check
reports skipped evidence too. The author must inspect that evidence and assess
responsibilities and labels that a code check cannot prove.

`--suggest` uses the time when the variant stopped being current to find the
last commit before that time in each repository's HEAD ancestry. These commits
are guesses. An author inspects them and supplies the exact commits to preview
and write. A repository with another historical branch can need a different
commit. A missing timestamp or unavailable commit never selects current code.
