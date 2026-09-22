# Semantic boards implementation design

Date: 2026-09-11. Branch: `feat/semantic-boards`. Spec: TASK-170.

Status: accepted. The user approved the product decisions, implementation approach,
ticket breakdown, and autonomous delivery through Claude Opus 5 in herdr.
Product decisions are recorded in [ADR 0023](../adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md).
TASK-171 through TASK-181 are the delivery plan of record; this document describes
the resulting system and its verification.

## Intended result

An agent writes architectural meaning once. An adapted PR Lens renderer consistently
lays it out as architecture or message sequence, with visual and typographic hierarchy.
A person explores named views, follows code and drill-down links, presents an authored
walkthrough, and compares proposals through automatically derived change labels.

Each board owns a branching family of variants. Drafts inherit nonconflicting parent
changes, conflicting proposals remain inspectable, and the command that caused the
conflict gives the agent enough information to resolve it. Adoption records implemented
architecture without erasing the former current state.

## Canonical data and identity

One versioned JSON file owns a board's metadata, shared views, variant tree, current
designation, and adoption records. The persisted version and writer claim cover the entire board.
There is no cross-board architecture database or transaction spanning levels.

Compose the contract in Zod, infer its TypeScript types, and reuse compatible PR Lens
definitions rather than redeclaring them. Expose a combined schema that can generate
JSON Schema when a consumer needs it. Referential integrity, containment cycles, and
variant ancestry checks remain runtime validation where JSON Schema cannot express
them. Do not maintain a second handwritten JSON Schema.

Use stable IDs for boards, variants, nodes, edges, views, flows, and ordered steps.
Continue minting through the existing ID owner. Names are human-readable labels, and
`current` resolves to a named variant's stable identity. Copies inherited across
variants retain architectural IDs; creating an unrelated entity mints a new one.
Comparison must not infer edge identity from endpoints, names, or array position.

A variant owns its architectural content:

- Nodes: identity, kind, name, optional responsibility and description, optional
  structural parent, optional primary code binding, and optional drill-down target.
- Edges: stable identity, endpoints, relationship meaning, and explanatory content.
- Flows: participants and explicitly ordered steps referring to those nodes.
- An optional walkthrough: ordered explanations, target views, and focused subjects.

The board owns views: identity, name, grammar, selected content, and presentation
intent. Every variant supplies content to the same views; absent subjects produce
an empty or partial reading. Views are outside variant inheritance and comparison.
This replaces the initial variant-owned view contract (2026-09-13); the unpublished
board format breaks deliberately, with authored boards repaired in place.

Containment is acyclic and has at most one parent per node. It is distinct from a
board's abstraction level: system and service internals remain separate linked boards.
Bindings are optional and repository-specific per node. Drill-down targets explicitly
select a board and named variant or its `current` designation, with no silent fallback.

An empty board is a valid starting state. PR Lens's mandatory PR provenance, deltas,
flat lanes, and nonempty graph are not requirements of the persisted board contract.
Agent input contains no pixel geometry, font choices, or route coordinates.

## One board-state module

Keep parsing, semantic edits, comparison, reconciliation, lifecycle transitions, and
their structured results behind a small board-state interface. Its pure transition
logic consumes a validated board and a command, and returns a candidate board plus the
command's outcome. The existing write owner supplies claims, expected-version checks,
atomic persistence with fsync, and publication after the write succeeds.

The operations need to express creation of a named state, one batch of semantic edits,
branching, conflict resolution, and explicit adoption. Reads expose the selected
variant, views, ancestry/adoption history, and reconciliation issues. Command transport
and dynamic tools use these same operations; they must not own parallel merge logic.

Do not expose reconciliation storage details as agent authoring obligations. A proposed
minimal internal representation is a complete coherent semantic state for each variant
plus the last parent state it successfully reconciled against. That second value is
merge history, not a second authoritative present. It lets the engine distinguish
parent changes from the child's own edits without replaying an unbounded event log.

Retaining an old parent state internally does not pin the displayed proposal baseline:
successful reconciliation advances it automatically. Full state and reconciliation
history reside in the same board file and are committed together. Storage simplification
must preserve deterministic recovery and last-coherent-state rendering across restart.

## Write and reconciliation contract

1. Resolve one board, verify its claim and expected version, and read it once.
2. Validate the requested semantic edit and apply it to an inert candidate.
3. Reconcile affected draft descendants in parent-before-child order. Adopted states
   stop inheritance; their draft descendants follow their explicitly edited content.
4. Validate each reconciled candidate. Independent field changes merge; equal changes
   agree; incompatible same-field changes, delete/edit conflicts, broken references,
   and conflicting order changes require resolution.
5. Keep a conflicted variant's previous coherent state. Descendants that cannot advance
   through it stay coherent and identify that ancestor as their blocker. Unrelated
   branches continue reconciling.
6. Atomically persist the requested edit, safe propagation, and issue records, advancing
   the board version once. Publish committed state to viewers and context consumers.
7. Return `applied`, `applied with reconciliation required`, or `rejected`, with precise
   committed version, affected variants/subjects, issues, and repair instructions.

A stale version, invalid initiating edit, missing claim, or failed persistence does not
become an applied outcome. Descendant conflicts do not roll back a valid initiating
edit. A rendering failure after a successful write must not invite replaying that write.
Resolution is a new version-checked command from the agent, not a frontend edit or a
silent parent-wins/child-wins policy. Recompute against the latest persisted parent when
resolving so additional changes cannot be overwritten using an obsolete issue report.

When an edit changes content used by a walkthrough, the command's affected-subject
guidance gives the agent context to keep the explanation accurate. Structural reference
validation can detect a missing target; it cannot verify arbitrary narrative claims.

## Variants and adoption

Draft proposals track their actual predecessor, including competing siblings. The
movable current designation never implicitly reparents other variants.

Any coherent draft can be explicitly adopted, including a sibling of current. Adoption
records the transition, moves current, freezes the former current, and stops inheritance
into the adopted state. It does not imply that an ancestor proposal was ever implemented.
The current state remains explicitly editable. Historical states reject ordinary edits;
history correction and automatic cross-board historical snapshots are deferred.

The viewer shows proposal ancestry and adoption history as distinct facts. A historical
board's drill-down opens the named target and discloses that target's lifecycle; it does
not claim to reconstruct a time-consistent snapshot across multiple independent boards.

## Comparison and rendering

Comparison reads semantic states before view filtering. A view hiding a node is not a
node deletion. Match by stable identity and derive added, removed, changed, and unchanged
subjects; retain field-level before/after information for inspection and agent reasoning.
Only the entity whose semantic content changed gets its change label. Narrative/view
changes and presentation geometry do not turn unchanged architectural nodes into changes.

Proposal rendering automatically uses its predecessor comparison. Removed subjects come
from the baseline only in the derived depiction, never as authored tombstone nodes.
Scope removed subjects deliberately for the selected view and keep their reference
context available. Unresolved variants must visibly disclose their last coherent state
and the newer parent issues; an old picture must not masquerade as successful reconciliation.

Bring PR Lens renderer and reusable schema source into the repository at the inspected
revision `0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0`, with license and provenance retained.
Use local module interfaces and the repository's TypeScript, lint, and boundary rules.
No separate publishing workflow or permanent lint exemptions are part of the fork.

Adapt flat lane assumptions to real containment, preserve both grammars, and provide
node responsibility/description treatment and stable graphical identity. Layout, routing,
text fitting, icons, typography, and animation remain renderer responsibilities. Preserve
the measured-text requirement while adapting PR Lens's approximate metrics; do not ask
agents to repair text geometry. Exact layout mechanics are implementation choices to
validate visually against the agreed example.

Initially render through the server, returning SVG and a geometry atlas. Keep browser
camera, selection, active view, and walkthrough position as presentation state. They
never become competing copies of architectural content. Rendered assets are derived
artifacts, reproducible on demand and ignored unless a documented fixture needs tracking.

## Viewer and integration

Replace the drawing stage with a read-only architecture viewer in the existing pane
shell. Preserve pan/zoom, selection, inspection, code navigation, explicit drill-down,
and agent requests grounded in selected semantic identities. Support named view switching
and displaying distinct views in panes. Large diagrams remain navigable without an
invented fit-to-viewport constraint.

Build the narrative rail and scroll-driven focus from authored walkthrough steps and
the geometry atlas; the hosted PR Lens viewer is not included in its open-source package.
Keyboard-accessible navigation and reduced-motion handling belong in this viewer.

Retain the owned Codex workhorse/coordinator, voice, claims/progress, and context delivery
contracts. Replace their element-level projections with selected semantic subjects,
variant/view identity, derived changes, and reconciliation issues. A view or camera change
does not write the board. Existing URLs and code-target workflows need deliberate new
board/variant/view addressing rather than depending on a drawn scene.

## Replacement and scope

The final product has one semantic board model, not permanent free-drawing and semantic
editing modes. Delete obsolete free-drawing, promotion, stencil, native-element conversion,
and geometry-inference paths as their consumers move to semantic contracts. Preserve useful
atomic write, version, claim, code-binding, browser routing, and Codex integration owners.

Legacy board files remain untouched. Native Obsidian editing, legacy conversion, a history
correction mechanism, multi-parent merges, and automatic snapshots spanning boards are
outside this delivery. Preservation does not promise that the new viewer opens old formats.
Keep documentation explicit about that boundary rather than silently modifying old files.

## Validation and delivery order

The Backlog plan delivers complete vertical slices, beginning with an agent-created,
persisted architecture board rendered in a read-only pane (TASK-171). Follow-on slices
add inspection and linked levels (172), both grammars and named views (173), proposal
differences (174), narrative presentation (178), propagation and durable issues (175),
resolution (176), adoption/history (177), and semantic agent/voice workflows (179).
The real example verifies the integrated behavior (180), before obsolete paths are
removed and the complete product gate runs (181). Native Backlog dependencies govern
the eligible frontier. Temporary coexistence on this integration branch is a delivery
mechanism, never a second supported product mode.

Use this feature's current/proposed pipeline as the canonical authored input. Render both
grammars, show hierarchy and linked levels, present its leadership narrative, create two
competing children and a chained proposal, propagate a safe edit, introduce and resolve a
real conflict, restart while conflicted, and adopt a competing coherent draft. Verify that
the prior current freezes and no longer inherits while the new current remains editable.

Use focused runtime contract tests for identity, field/order reconciliation, stale-write
refusal, restart recovery, and atomic outcomes. Use rendered/browser verification for both
grammars, removed/changed labels, last-coherent-state disclosure, view switching, navigation,
selection-grounded agent work, and scroll-driven narrative focus. Reuse existing owners
where appropriate and avoid duplicated or static-file-content tests.

Finish with the repository's complete `bun run check` gate and a direct run through the
example in the real application. Keep Zod runtime integrity checks distinct from visual
validation: a valid document alone does not prove a readable diagram.
