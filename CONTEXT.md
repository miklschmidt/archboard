# Archboard

A shared architecture surface. An agent and a human build, explore, and refactor
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

**Kind**:
What sort of architectural unit a node stands for — service, queue, datastore,
gateway, or external system.
_Avoid_: type, category, role, class

**Binding**:
The optional association between a node and its primary code location. Each node
has at most one binding, and nodes on the same board may name different repositories.
_Avoid_: link, mapping, reference, pointer, association

**Code target**:
The action offered when a person activates a binding. It is derived anew for
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
What a node belongs to, as one optional short label: an effort, a team, a
migration, a family of parts. It is independent of containment and of kind, is
never inherited from a parent, and a node is in at most one. A renderer owns
what a group looks like — it derives a colour from the label and stores none —
so moving a part between groups changes the architecture and retuning the
colours changes nothing.
_Avoid_: tag, category, layer, swimlane, colour

**Presentation intent**:
What a board's depiction should explain: its focal subject, main flow, and
diagram grammar. It expresses the intended reading without specifying geometry
or styling.
_Avoid_: coordinates, theme, layout settings

**Level**:
The abstraction tier a board sits at, drawn from a controlled vocabulary that
grows as new tiers are genuinely needed — initially system, service, module. A
system board shows interactions between services; a service board shows interactions
between its modules, with navigation connecting these separate boards. A
node carries one only to say it differs from its board; a node that says
nothing is at its board's level.
_Avoid_: layer, depth, zoom, tier, granularity

**Drill-down**:
Moving from a node on one board to an explicitly linked board and variant
describing that node's internals.
_Avoid_: zoom in, expand, descend, navigate, open

**Variant**:
One named state in a board's evolution. Each successor has one predecessor and
shows changes relative to it through the board's shared views; a predecessor may
have several competing successors.
_Avoid_: version (that is which edit the board's note is),
revision, branch, mode, state

**Current**:
The designation of the variant that describes the architecture that exists.
Moving this designation preserves the names and identities of both states.
_Avoid_: latest, default proposal

**Adoption**:
Explicitly designating a variant as the implemented architecture, retaining the
formerly current state as named history and recording when the designation changed.
_Avoid_: promotion (the legacy element-to-node operation), rename, merge

**Historical variant**:
A formerly current architectural state retained under its name after a successor
is adopted. It is frozen against ordinary edits so it preserves what existed.
_Avoid_: abandoned proposal, snapshot

**Reconciliation**:
Bringing a draft variant up to date with its predecessor while retaining its own
proposed changes. Nonconflicting changes carry through automatically; conflicting
edits or broken references require resolution. Adopted states do not inherit automatically.
_Avoid_: comparison, adoption

**Walkthrough**:
An optional agent-authored narrative belonging to a variant, explaining it through ordered text,
target views, and focused diagram subjects. It supports presenting architecture
while highlighting the parts being discussed.
_Avoid_: variant, flow

**Comparison**:
The differences between two board variants, identified by the stable identities
of their architectural content. A proposal's views show its comparison with its baseline
as derived change labels, rather than authored content.
_Avoid_: variant, change report

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
into a copy the canvas keeps until a person picks reload, overwrite or save
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

**Pending edits**:
User edits that differ from the pane's baseline and that the server has not
accepted. A pane with pending edits has a change report in flight or scheduled.
_Avoid_: unsaved changes, dirty state, unreported changes

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
