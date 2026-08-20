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
grows as new tiers are genuinely needed — initially system, service, module.
_Avoid_: layer, depth, zoom, tier, granularity

**Drill-down**:
Moving from a node on one board to the board describing that node's internals.
_Avoid_: zoom in, expand, descend, navigate, open

**Variant**:
One of an open set of alternative states of the same board. `current` is
privileged as the architecture that exists; every other variant is a proposal.
_Avoid_: version, revision, branch, mode, state

**Vault**:
The cross-repository collection in which every board is persisted.
_Avoid_: library (it means the stencil palette here), workspace, store,
repository, folder

### Working

**Read-back**:
The agent re-reading a board after a human has changed it, so that the change
can be interpreted as a statement about the design.
_Avoid_: sync, refresh, reload, poll, re-scan

**Proposal**:
A set of boards, one per affected subject, describing a refactor that has not
been carried out.
_Avoid_: plan, design, draft, RFC
