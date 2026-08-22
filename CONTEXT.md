# Archboard

A shared architecture surface. An agent and a human build, explore, and refactor
a codebase's structure together by drawing it, rearranging it, and reading the
rearrangement back.

## Language

### The surface

**Board**:
A named, persisted architecture diagram covering one subject at one abstraction
level. The unit of saving, linking, and comparison.
_Avoid_: document, drawing, diagram, whiteboard, sketch

**Canvas**:
The live editable surface on which exactly one board is open at a time.
_Avoid_: scene, workspace, session, drawing area

**Pane**:
One of several side-by-side slots, each holding its own canvas, so that two
boards can be worked on at once.
_Avoid_: split, view, tab, panel, frame, window

**Element**:
A primitive on the canvas — a rectangle, arrow, or piece of text — carrying no
architectural meaning by itself.
_Avoid_: shape, object, item, primitive

**Node**:
An element that stands for an architectural unit.
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

### Meaning

**Kind**:
What sort of architectural unit a node stands for — service, queue, datastore,
gateway, or external system.
_Avoid_: type, category, role, class

**Binding**:
The association between a node and the code it stands for.
_Avoid_: link, mapping, reference, pointer, association

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

**Level**:
The abstraction tier a board sits at, drawn from a controlled vocabulary that
grows as new tiers are genuinely needed — initially system, service, module. A
node carries one only to say it differs from its board; a node that says
nothing is at its board's level.
_Avoid_: layer, depth, zoom, tier, granularity

**Drill-down**:
Moving from a node on one board to the board describing that node's internals.
_Avoid_: zoom in, expand, descend, navigate, open

**Variant**:
One of an open set of alternative states of the same board. `current` is
privileged as the architecture that exists; every other variant is a proposal.
_Avoid_: version, revision, branch, mode, state

**Note**:
The file in the vault holding one board. Obsidian's word for a document, kept
because the file is meant to be opened and edited there as well. The note is
the board: the canvas reads it and writes it and keeps no copy of one.
_Avoid_: file, document, markdown, page, record

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

**Read-back**:
The agent re-reading a board after a human has changed it, so that the change
can be interpreted as a statement about the design.
_Avoid_: sync, refresh, reload, poll, re-scan

**Doing**:
The one line an agent says about a board as it writes to it, shown on the
canvas while the write lands. A claim's reason is the campaign an agent has the
board for; a doing is one step of it, and a write that says none is refused.
_Avoid_: description, why, message, comment, log, reason (that is the claim's)

**Proposal**:
A set of boards, one per affected subject, describing a refactor that has not
been carried out.
_Avoid_: plan, design, draft, RFC
