# Architecture discovery and interaction

Design direction recorded from the owner discussion on 2026-10-25, during
TASK-543. This document preserves the agreed product direction before the
storage research starts. It describes intended behavior, not the product as
implemented today. The final section separates unresolved choices from that
direction.

## Purpose and retained meaning

Archboard communicates the essence of a system. Agents supply intent, reasons,
grouping, and architectural meaning. Readers explore and question those
explanations without managing a collection of overlapping diagrams.

The existing semantic model remains the foundation. Parts retain identities,
kinds, responsibilities, code bindings, and containment. Relationships connect
those parts. Flows describe ordered behavior, including decisions and loops.
Proposals describe possible changes to that meaning.

Code-intel supplies evidence about the implementation. It supports explanations
and detects disagreement with the code. Extracted code facts do not automatically
become architectural subjects or visible diagram elements. A direct picture of
every declaration and call contains detail that the reader did not ask for.

The problem under examination is ownership across boards and flat JSON files.
The storage research must preserve the semantic model rather than replace it
with a different product.

## Recursive decomposition

A module can contain cooperating modules at any depth. It is a whole to its
callers and a system of parts to the reader who opens it. Opening it changes
the scope of attention. The underlying architecture stays the same.

Scope means the part of the architecture under examination. Opening a module
shows its immediate parts, with their own internals closed. The same operation
works again on any part that has children. The chosen module supplies the
context of the reading rather than another enclosing box with no distinct
meaning.

Opening a module does not copy nodes, create a board, or change a variant.
Readers can return through their navigation path. A module keeps its kind when
the reader opens it. Its kind describes what it is, independently of the current
scope.

The global board classification `level` does not fit this model. No stored
numeric depth replaces it. A reader's position follows actual containment and
the path through the architecture.

## One definition, many appearances

An architectural subject needs one canonical home, meaning one authoritative
definition. Different readings reference that definition. They do not maintain
separate copies of its responsibility, internals, or relationships.

For example, Authentication can appear beside Orders and beside Payments.
Both appearances refer to the same subject. Opening either reveals the same
internals for the same architectural state. A proposal changes that subject
once, and every relevant reading reflects the change.

Containment keeps the existing distinction between structural membership and
other relationships. A part has at most one structural parent. Dependencies
express reuse, and groups express concerns that cross containment. Appearing
in another reading does not create another parent.

Boards no longer provide a sound ownership boundary for overlapping parts.
The replacement must make subject ownership explicit across the overall model.
Its exact schema, file placement, address format, and migration rules remain
open. Shared identity does not require one enormous file or one global editing
claim.

## Module and flow files

The current focus returns to improving JSON files in the repository. Database
selection and hosted deployment are deferred. The later deployment sections
preserve that future direction.

`[name].module.json` holds one canonical module definition and its outgoing
relationships. The module supplies each relationship's source. Each relationship
has a stable ID and names its target by module ID. Incoming relationships are
derived from references across the repository.

A module can name one parent. Modules without a parent form the repository's
top-level reading. Moving or renaming a file does not change module identity.
The combined model resolves references across files and derives the selected
scope without copying module definitions into another document.

`[name].flows.json` holds one or more named flows. Flow messages reference module
IDs, and the existing ordered steps, decisions, and loops retain their meaning.
The filename groups flows for authoring. It does not restrict their participants
to one module or require a matching module file.

The target format retires `[name].semantic.json`. Module and flow files carry
the semantic facts. The combined model is derived from those files, so no
separately authored aggregate board is needed. Repository-wide vocabulary and
policy remain configuration concerns.

Proposals, variant history, and walkthroughs still need an explicit storage
design before migration. Retiring the board document must preserve those
capabilities. Their placement is unresolved and does not establish another
per-module board or variant tree.

## Dynamic readings and selection

A reading is a temporary description of what the reader wants drawn. It carries
the current scope, selected subjects, filters, diagram mode, and architectural
state. Agents can compose readings on demand. Readers can compose them through
direct interaction.

Basic exploration requires no authored view for every module. Readers can
select several elements with a drag selection or Ctrl/Cmd-click, then focus
that selection. Focus changes the reading. It does not create a new module,
change containment, or edit architectural meaning.

The reading can retain directly connected callers and dependencies as context.
Outside the current scope does not mean third-party code. The existing
`external` kind continues to describe code that the project does not own.

Named views are no longer a prerequisite for navigation. Whether the product
keeps optional named bookmarks remains open. Sharing, documentation, and
walkthroughs still need a way to reproduce the reading that somebody discussed.

## Visibility and noise

The first picture presents a useful explanation before the reader applies
filters. It shows immediate parts and combines relationships between hidden
descendants. Readers can inspect the underlying relationships and their
evidence when they need detail.

Readers can control the visibility of groups and relationship kinds. These
controls affect presentation without changing the architecture. Active filters
must remain apparent so that a hidden relationship does not look absent from
the model.

A container's interface remains a fact derived from the architectural state.
Focus and filtering do not redefine its entry points or callers. The exact
default amount of outside context remains an interaction decision.

## Diagram modes

Architecture, sequence, and flowchart are complementary readings of shared
subjects. Architecture shows parts and relationships. Sequence shows an ordered
exchange. Flowchart shows decisions and control flow.

A mode switcher is a proposed way to reach these readings without creating
separate boards. The modes must use information that supports their meaning.
Dependency arrows alone do not establish execution order, conditions, retries,
or asynchronous behavior.

Sequence and flowchart readings need an appropriate flow. When that flow does
not exist, an agent can investigate and explain it. The product must expose
the missing information rather than invent an order. The exact interaction for
choosing or requesting a flow remains open.

## Explanations in the reading

Readers need quick access to agent actions for the subjects on screen. A toolbar
or right-click menu can expose those actions. The final placement remains open.
The controls need a visible, keyboard-accessible route as well.

Candidate actions include the following:

- Explain the selected subject or subjects.
- Explain a selected relationship.
- Trace a flow through the selected scope.
- Explain a proposed change.

The voice coordinator invokes the same actions on the workhorse. The interface
fills with text explanations while the voice model explains the same material.
Mouse, keyboard, typed requests, and voice reach the same action behavior.

An action carries the resolved subjects and the reading that prompted it.
The workhorse returns explanations tied to those subjects and their evidence.
The text and spoken explanation share that result, so they do not develop
independent accounts of what the architecture means.

Later navigation does not silently retarget an action already requested.
Temporary answers stay associated with their original reading. Whether a useful
answer becomes persistent subject documentation remains an explicit design
choice. Persistent explanations must not become another set of diagram-owned
copies.

## Rendering and interaction

The native Rust renderer performs layout, placement, sizing, and routing. It
supplies a scene model, which describes what the frontend renders. The frontend
retains control of interaction and can render that scene through its chosen
technology.

Layout computation stays on the user's machine or runs in the client, including
when the frontend uses hosted storage. The hosted service does not supply
renderer compute. The choice between a local native process and a client runtime
remains open.

Selection and highlighting respond without another layout operation. Changes
to scope or visible content request a new scene. The frontend preserves the
reader's location where possible and never lets an older result replace a
newer request.

Fast rendering supports dynamic exploration, but the full path matters. Source
analysis, scope resolution, layout, transport, and frontend rendering all affect
the delay that a reader experiences. No latency claim is established by this
discussion.

## Proposals and source evidence

Proposals continue to refer to stable architectural subjects and a known
starting state. Looking at a proposal does not create duplicate definitions for
each reading. Historical explanations need to retain the architectural state
and source evidence that they describe.

Architectural identity remains distinct from a source path or a content hash.
A rename or changed responsibility does not create a different subject.
Repository and source-revision associations remain necessary even if the
architecture stops living in Git-tracked files.

## Local operation and hosted boundary

The owner clarified the deployment direction on 2026-10-26. The complete
replacement must work locally before deployment to a hosted environment.
Local operation includes the new storage model, frontend, renderer, and their
integration with machine-local agents.

The current direction keeps the full Archboard frontend local, alongside the
renderer and agents. Local frontend operation keeps agent communication on the
user's machine. All agent execution and agent session state remain there.
Code bindings identify source that local tools can access.

The eventual hosted service provides architecture storage and a separate web
app for billing, account management, authentication, authorization, and a
simplified viewer. Authentication identifies the caller. Authorization controls
what the caller can access. The hosted service contains no repository checkouts
or agent workers. Rendering remains on the reader's machine or in the client.

Scaleway Kapsule is the intended production deployment target. EU sovereignty
and low maintenance guide that deployment. Kapsule is a future operating
environment, not a prerequisite for developing or using the new model locally.
The architecture database engine remains undecided.

The storage interface must support both local and hosted operation. Rendering
stays local in either deployment. The full frontend communicates with local
agents. The simplified hosted viewer does not need a connection to those agents.

## Shared diagrams and private links

An SVG in a GitHub pull request or README can link to the simplified viewer.
The viewer loads the permitted architecture data and renders the diagram in
the reader's client. Readers need no repository checkout or running agent to
open a shared diagram.

A private link identifies an architectural reading. The access policy remains
open: it can require an authorized account or grant access through possession
of the link. Whether a link pins a revision or follows later changes also
remains open. The hosted service must enforce the chosen access policy when
it serves architecture data.

## Account and architecture storage

Managed PostgreSQL is the expected production store for data outside the
architecture model. This includes application account records, identity-provider
references, billing state, and sharing permissions. Local development must run
PostgreSQL locally before using a managed service.

The architecture store owns modules, relationships, flows, explanations,
proposals, and their history. Account and sharing records reference stable
architecture identifiers. They do not copy the architecture model into
PostgreSQL. PostgreSQL's account role does not decide the architecture engine.

Clerk and WorkOS are identity-provider candidates. Provider selection remains
open, including fit with the EU sovereignty preference. The sign-in flow for
the local app and the division of authorization responsibilities still need
design. Local operation must not depend on deploying the account portal to
Kapsule first.

## Open decisions

The following choices remain unresolved:

- The exact module and flow schemas, file placement, and local startup behavior.
- The deferred architecture database engine and deployment configuration.
- The managed PostgreSQL provider and application account schema.
- The identity provider, local sign-in flow, and authorization responsibilities.
- The access policy and revision behavior of private viewer links.
- The storage and revision model for proposals, variant history, and walkthroughs.
- The role of Merkle structures in snapshots, comparisons, or synchronization.
- The migration of overlapping board subjects and their historical identities.
- The scope of editing claims and transactions after board ownership ends.
- The association between architectural states, repositories, branches, and worktrees.
- Whether saved readings have names.
- The exact distinction between opening one module and focusing an arbitrary selection.
- The default outside context, filter behavior, and treatment of hidden selections.
- The placement and wording of explanation actions, and how readers retain an answer.
- The interaction for choosing a flow when the reader switches diagram mode.

The owner specifically names [Dolt](https://github.com/dolthub/dolt) as a storage
candidate. That is an input to TASK-543, not a technology decision.

## Current implementation references

These sources explain the implementation that the proposed direction changes.
They do not constrain the future storage choice:

- [Product purpose and current boundaries](../../PRODUCT.md).
- [Current domain language](../../CONTEXT.md).
- [Independent board ownership](../adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md).
- [Level-based drill-down](../adr/0029-a-node-standing-for-another-board-carries-that-boards-level.md).
- [Container interfaces](../adr/0044-a-containers-interface-is-what-relationships-from-outside-reach.md).
- [Derived board overview](../adr/0052-a-board-opens-on-its-overview.md).
- [Current semantic subjects](../../packages/board/src/shared/schemas/content.ts).
- [Current reading projection](../../packages/board/src/shared/rules/scope.ts).
- [Current coordinator actions](../../packages/workbench/src/runtime/protocol/coordinator-tool-contract/tool-inputs.ts).

The existing ADRs continue to describe shipped behavior. Implementing this
direction requires explicit replacements for the decisions that change.
