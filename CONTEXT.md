# Archboard

A shared architecture surface. An agent and a user build, explore, and refactor
a codebase's structure through boards that express architectural meaning.

## Language

### The surface

**Board**:
A semantically named description of one architectural subject or question at one
abstraction level. A board owns its shared views and the tree of variants recording
how that diagram evolves.
_Avoid_: document, drawing, diagram, whiteboard, sketch

**Canvas**:
The live, pannable and zoomable surface on which exactly one board is open at a
time for exploration and inspection.
_Avoid_: scene, workspace, session, drawing area

**View**:
A named way of reading a board, with a shared diagram grammar and scope across
every variant. The view stays the same while the selected variant supplies the
architectural content.
_Avoid_: board, pane, variant

**Pane**:
One of several side-by-side slots, each holding its own canvas, so that two
boards can be worked on at once.
_Avoid_: split, view, tab, panel, frame, window

**User**:
Whoever is reading the canvas and talking to it. A user reads, picks things out
and speaks; agents author.
_Avoid_: person, human, operator, viewer

**Element**:
A primitive on the canvas — a rectangle, arrow, or piece of text — carrying no
architectural meaning by itself.
_Avoid_: shape, object, item, primitive

**Node**:
An architectural unit described on a board, with an identity and kind independent
of how it is drawn. It has a name and may carry a short responsibility and a detailed
description.
_Avoid_: box, component, entity, vertex, block

**Edge**:
A connection between two nodes standing for a dependency, call, or flow.
_Avoid_: arrow, link, connector, relation, line

**Card**:
The compact depiction of a node with no children shown inside it in the selected
reading. It is a presentation of a node, not a node kind.
_Avoid_: node, leaf kind

**Container**:
The expanded depiction of a node enclosing its visible children. It represents
structural containment without changing the node's kind or identity.
_Avoid_: container kind, group, platform tag

**Icon chip**:
The icon and its surrounding tile identifying a node's kind on a card or container.
_Avoid_: comparison badge, card body

**Library**:
The palette of stencils available to drag onto any board. One per canvas
server, shared by every pane and every tab (ADR 0007). Never a synonym for the
vault, which is where boards live.
_Avoid_: palette, assets, collection, shapes panel

**Stencil**:
One item in the library: a small group of elements kept for reuse. It carries
no architectural meaning until it is on a board and promoted, and it stops
being a stencil the moment it is dragged onto one.
_Avoid_: symbol, icon, template, component, widget

### Commands

**Board operation**:
An action whose subject is an explicitly named Board. It resolves the Board's
Note directly and needs no live Canvas, Pane, selection, camera, or connected
browser.
_Avoid_: canvas command, pane command, headless command

**Browser operation**:
An action whose subject is a live Archboard browser session, such as displaying
a Board, reading selection, moving a camera, or capturing a Pane. It never
changes a Board's Note.
_Avoid_: view command, board command, pane command

**Board render**:
An image produced by the server from one named Board snapshot, independent of
any live Pane or Canvas camera. It uses a server-owned renderer and never
attaches to a browser session.
_Avoid_: screenshot, browser capture, pane export

**Browser capture**:
An image of what a named live browser target shows, including its Pane and
camera state.
_Avoid_: board render, export, unqualified screenshot

### Meaning

**Vault vocabulary**:
The consumer-defined set of board levels, node kinds and relationship kinds used
to describe architecture across a vault. It names architectural meaning independently
of the visual policy used to depict it.
_Avoid_: palette, theme, board content

**Kind**:
The consumer-defined node type: what sort of architectural unit a node stands
for, such as an API, Kubernetes cluster, queue or third-party library. The
vocabulary offers one kind per level, so a node standing for another board can
carry that board's level as its kind (ADR 0029).
_Avoid_: category, role, class, drawing shape

**External**:
The kind for code this codebase does not own: a library, a framework, a
runtime, a shell, a hosted service, a caller outside the checkout. Never a part
of this codebase that a reader reaches through another board.
_Avoid_: third-party kind for our own parts, link node, outside board

**Standing-for node**:
A node whose subject is what another board describes, carrying that board's
level as its kind and the drill-down that opens it. It is a real participant on
its own board first; a node added only to carry a link is a button, and a
diagram has no buttons (ADR 0029).
_Avoid_: link node, button, stub, proxy node

**Relationship kind**:
The consumer-defined type of architectural relationship represented by an edge.
_Avoid_: line style, arrowhead, emphasis

**Traffic**:
An optional illustration of flow along a connection, with independent animation
volume and speed; it is neither measured real-world activity nor connection importance.
_Avoid_: emphasis, pulse count

**Traffic volume**:
The rate at which illustrated traffic dots enter a connection, expressed in dots
per second.
_Avoid_: dot count, traffic speed

**Traffic speed**:
The distance an illustrated traffic dot travels along a connection per second.
_Avoid_: traversal duration, traffic volume

**Emphasis**:
The author-declared importance of a connection in the board's explanation,
independent of its relationship kind and traffic.
_Avoid_: traffic volume, line weight

**Binding**:
The optional association between a node and its primary code location. Each node
has at most one binding, and nodes on the same board may name different repositories.
_Avoid_: link, mapping, reference, pointer, association

**Code target**:
The action offered when a user activates a binding. It is derived anew for
this machine and is never part of the board.
_Avoid_: binding, persisted link, file URL, local binding, remote binding

**Opener**:
The machine-wide choice of application used to open a code target that resolves
inside a registered checkout.
_Avoid_: editor, file handler, command

**Logical address**:
A machine-independent way of naming code: a repository identity, a path within
it, and the branch and commit at which the binding was last confirmed.
_Avoid_: path, file reference, location, URI

**Repository identity**:
What a repository is called in a way that is the same in every clone and on
every machine: host, owner and name, taken from its `origin` remote.
_Avoid_: repo URL, remote, origin, project, package

**Checkout**:
One copy of a repository sitting at a path on one machine.
_Avoid_: clone, working copy, workspace, local repo

**Checkout registry**:
The machine-local record of which checkout holds which repository identity
here. The only place a directory on one machine is written down.
_Avoid_: index, cache, catalogue, repo config

**Promotion**:
Declaring a set of elements to be a node, giving it a kind and usually a
binding in the same act.
_Avoid_: mapping, tagging, assignment, conversion

### Structure

**Containment**:
One node being structurally part of another, with at most one structural parent.
Containment expresses membership independently of how nodes are drawn.
_Avoid_: lane, frame, rectangle

**Group**:
A concern a node belongs to, defined once in the vault configuration under a
stable readable id with a display name: an effort, a team, a migration, a family
of parts. A node's memberships are an explicit set of those ids; a node may be in
several groups, inherits none from its parent, and a group is independent of
containment and of kind. Renaming a group changes no board. Inspecting a group
reads its members, the relationships between them, the relationships crossing its
boundary and their direction, and the immediate neighbours those reach.
_Avoid_: tag, category, layer, swimlane, colour, label

**Visual policy**:
The vault-wide interpretation of semantic vocabulary as appearance, shared by
all boards and variants without changing their architectural meaning.
_Avoid_: board content, variant, style override

**Color palette**:
The curated set of named colors available to a visual policy.
_Avoid_: vault vocabulary, group, stencil library

**Color scope**:
The inherited color context established by a depicted container for itself and
its contents, distinct from each node's kind identification.
_Avoid_: group, platform tag, node kind

**Presentation intent**:
What a board's depiction should explain: its focal subject, main flow, and
diagram grammar. It expresses the intended reading without specifying geometry
or styling.
_Avoid_: coordinates, theme, layout settings

**Level**:
The required abstraction classification of a board, chosen from the vocabulary
defined by the vault's consumer — commonly system, service, module. A
system board shows interactions between services; a service board shows interactions
between its modules, with navigation connecting these separate boards. A node
is at its board's level unless it says otherwise, and the only nodes that say
otherwise are the ones standing for another board, which say it by carrying
that board's level as their kind.
_Avoid_: layer, depth, zoom, tier, granularity

**Drill-down**:
Moving from a node on one board to an explicitly linked board and variant
describing that node's internals. It is an affordance on a part the board draws
for its own sake: upward from the container the board describes, downward or
sideways from a card.
_Avoid_: zoom in, expand, descend, navigate, open

**Variant**:
One named state in a board's evolution, standing in exactly one lifecycle:
current, draft, historical or shelved. Each successor has one predecessor and
shows changes relative to it through the board's shared views; a predecessor may
have several competing successors.
_Avoid_: version (that is which edit the board's note is),
revision, branch, mode, state

**Current**:
The designation of the variant that describes the architecture that exists. A
board has at most one. A board for something nobody has built yet has none: every
variant on it is a draft or shelved, and that absence is how the board says nothing it
describes exists. Moving this designation preserves the names and identities of
both states.
_Avoid_: latest, default proposal

**Adoption**:
Explicitly designating a variant as the implemented architecture and recording when
the designation changed. A formerly current state is retained as named history; on a
board that had no current variant, adoption is the moment its architecture starts
existing, and nothing becomes history.
_Avoid_: promotion (the legacy element-to-node operation), rename, merge

**Historical variant**:
A formerly current architectural state retained under its name after a successor
is adopted. It is frozen against ordinary edits so it preserves what existed.
_Avoid_: abandoned proposal, snapshot, shelved variant (that was never current)

**Shelved variant**:
A proposal nobody intends to carry out, retained under its name with everything
it says. Shelving records when it was let go and why. A shelved variant stops
following the variant it came from, so edits above it raise nothing to settle,
and it is refused for content edits and for adoption the way history is —
propose it again by branching from it. Every drill-down naming it still opens it.
_Avoid_: abandoned, archived, deleted, closed, rejected, superseded (that is a
historical variant), withdrawn (that is a rolled-back optimistic edit)

**Reconciliation**:
Bringing a draft variant up to date with its predecessor while retaining its own
proposed changes. Nonconflicting changes carry through automatically; conflicting
edits or broken references require resolution. Only a draft inherits: adopted,
historical and shelved states do not, and shelving clears any standing the
proposal was holding rather than asking somebody to settle it first.
_Avoid_: comparison, adoption

**Walkthrough**:
An optional agent-authored narrative belonging to a variant, explaining it through ordered text,
target views, and focused diagram subjects. It supports presenting architecture
while highlighting the parts being discussed.
_Avoid_: variant, flow

**Narration**:
A voice session started to present one walkthrough as a talk. The voice model
paces it, asking for one step at a time; the coordinator presents each step in
the linked pane and hands it back once the pane says it has arrived. The
position in the walkthrough stays the pane's. What the user does to the pane by
hand is pane news the narrator stops for, so the words follow the picture.
_Avoid_: playback, autoplay, slideshow

**Subtitle**:
What the voice model is saying, laid over the picture of the pane voice runs
for, one cue of two lines at a time. The transcript arrives a word at a time on
the audio clock, so each word is shown as it arrives, and the subtitle goes once
the voice has been silent longer than it pauses mid-thought. It is presentation:
the browser's own, written nowhere, and the user can turn it off. What the
user says is never subtitled.
_Avoid_: caption (the walkthrough's step text), transcript (the dock's record)

**Pane news**:
Where a user's reading of a pane stands after they changed it by hand: the board,
variant or view they are now looking at, what they now have selected, or the pane
they moved to. It is told to the voice model as one sentence of names, saying
only what changed. A change an agent or the canvas caused is never pane news.
_Avoid_: callback, telemetry, event, selection report

**Outside change**:
A board change made by an agent that is neither the workhorse nor the voice
coordinator. The voice model and the coordinator are both told, because neither
asked for it and what they know of the board has stopped being true.
_Avoid_: external edit, foreign write, third-party change

**Comparison**:
The differences between two board variants, identified by the stable identities
of their architectural content. A proposal's views show its comparison with its baseline
as derived change labels, rather than authored content.
_Avoid_: variant, change report

**Comparison status**:
The derived added, changed, removed or unchanged standing of a subject relative
to a variant's comparison baseline.
_Avoid_: authored flag, selection, current designation

**Note**:
The file in the vault holding one board and its variants. The note is the
authoritative persisted content of the board.
_Avoid_: file, document, markdown, page, record

**Version**:
Which persisted edit of a board it is, shared by all its variants. A writer
names the version it edited so a change based on an older board can be refused.
_Avoid_: revision, generation, sequence, edition, variant (that is a different
architectural state, rather than the board's edit counter)

**Hold**:
The state of a board the canvas has stopped saving, because its note changed
underneath and writing would delete somebody else's work. Drawing carries on
into a copy the canvas keeps until a user picks reload, overwrite or save
elsewhere. It is about another application writing the note, never about
another archboard writer, which is a lock and has a holder.
_Avoid_: lock, conflict, freeze, pause, dirty, detached

**Written elsewhere**:
A board whose note has been changed by something that is not archboard, while a
pane goes on showing the board archboard last wrote. The step before a hold, and
distinguished from one by what has not happened: nothing has been refused,
because nothing has been written since. Obsidian, a sync client and `git pull`
are the writers it is about, being the ones no lock excludes.
_Avoid_: stale, dirty, out of date, drift, external change, conflict

**Vault**:
The cross-repository collection in which every board is persisted.
_Avoid_: library (it means the stencil palette here), workspace, store,
repository, folder

### Reading

**Reading direction**:
The way a view's architecture reads across the page, down or left to right.
It is a property of the rendered variant, derived from its shape.
_Avoid_: orientation, rotation, layout direction, landscape, portrait

**Reference pane**:
The board area of the desktop shell at its one supported size, with the
navigator and the inspector open and the fit margin taken off every side. What
a drawing is measured against.
_Avoid_: viewport, screen, window, canvas size, page

**Fit**:
How large a drawing shows whole in the reference pane: the scale that fits it,
capped at one. One measure on the scorecard, never the only one.
_Avoid_: density, aspect ratio, zoom (that is the camera's)

**Scorecard**:
Every measure a reader pays for in one drawing: fit, page area, card share,
route length, bends, crossings, margin lanes and the flank fan. One drawing is
better than another when it is better on more of these than it is worse; no
single measure decides.
_Avoid_: score, cost, quality metric

**Flank rule**:
Which side of the page returns travel and how a skip over a rank attaches to
its cards. It belongs to the rendered variant, independently of its ancestry.
_Avoid_: side convention, port rule, lane side

### Working

**Workhorse**:
The primary Codex thread linked to a pane for sustained code, repository, and
multi-step work. It may continue working while a voice coordinator answers and
investigates separately.
_Avoid_: main agent, coding thread, backend agent, worker (that is also an agent
role)

**Thread link**:
The explicit runtime association between a pane and one controllable Codex
workhorse on Archboard's owned app-server child. It never lives in the board or
follows another client's active thread, and child exit invalidates it.
_Avoid_: binding (that means node-to-code here), attachment, selected thread,
active task, task link

**Voice coordinator**:
The persistent fast Codex thread linked to one pane and workhorse. Realtime voice
attaches to it; it handles conversation and bounded direct work while routing
sustained work to the workhorse.
_Avoid_: voice model (that is only one part of the realtime path), voice agent,
router, facilitator, copilot

**Read-back**:
The agent re-reading a board to understand its current architecture and any
changes to the design.
_Avoid_: sync, refresh, reload, poll, re-scan

**Baseline**:
The fingerprint of each element the pane has received from the server or had
accepted in a change report. A pane reports a deletion only for an element in
its baseline.
_Avoid_: scene, board copy, snapshot, cache

**Change report**:
The element upserts and deletions a pane computes by comparing its scene with
its baseline. The server persists the report before answering. An ordinary
human report receives compact canonical corrections plus the written board's
fingerprint and version; an agent report receives its touched elements and
fingerprint, and receives the resulting board only when it explicitly asks for
the document.
_Avoid_: sync, save, scene replacement, patch

**Doing**:
The one line an agent says about a board as it writes to it, shown on the
canvas while the write lands. A claim's reason is the campaign an agent has the
board for; a doing is one step of it, and a write that says none is refused.
_Avoid_: description, why, message, comment, log, reason (that is the claim's)

**Proposal**:
A set of boards, one per affected subject, describing a refactor that has not
been carried out.
_Avoid_: plan, design, draft, RFC
