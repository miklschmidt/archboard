# Archboard

Archboard is a shared architecture surface for a codebase.
Agents author one model that decomposes recursively into modules, and users read it.

## Language

### The model

**Model**:
The one architecture that one vault holds, assembled from its modules, relationships, flows, walkthroughs and active proposals.
It has a stable identity and a name, and every reading derives from it.
_Avoid_: board, document, drawing, diagram, whiteboard, sketch

**Manifest**:
The record that gives a model its stable identity, its name and its optional current designation.
It holds no copy of the modules.
_Avoid_: index, catalogue

**Vault**:
The directory that holds one model, in a checkout or in a registered local directory.
A vault in a checkout is versioned with its repository, so each checkout has its own copy, and its model can describe any repository.
_Avoid_: library, workspace, store, repository, folder

**Untracked vault**:
A vault in a directory that is not a Git checkout.
It has no repository identity, and its history stays local until somebody publishes it.
_Avoid_: loose vault, external vault, global vault

**Module**:
One architectural responsibility with a stable qualified identity, a whole to its callers and a system of parts to the user who opens it.
A module decomposes into modules, and each of those can decompose again.
_Avoid_: board, node, box, component, entity, vertex, block, level

**Containment**:
One module being structurally part of another, with at most one parent in the same model.
Parents form a containment forest, which has no levels and stores no depth.
_Avoid_: level, depth, tier, layer, lane, frame, rectangle

**Root module**:
A module with no parent.
_Avoid_: root board, top level

**Part**:
A child module as the open module shows it.
The word names a role in a reading, not a second kind of thing.
_Avoid_: node, element

**Subject**:
Anything in a model with its own identity: a module, a relationship, a flow collection, a flow, a step, a walkthrough or a beat.
_Avoid_: element, entity, object

**Qualified identity**:
The stable identity of a subject: an origin namespace and a short local ID, which an imported subject extends with its original legacy board.
No name, path or code binding establishes it.
_Avoid_: name, path, alias

**Former name**:
A name that a subject had before a rename.
If it matches exactly one subject, it still finds that subject, and a rename changes nothing else (ADR 0036).
_Avoid_: alias, old name, redirect

**Relationship**:
A directed architectural connection that one module owns and that names another module as its target.
The model derives incoming relationships, so a relationship has one definition at its source.
_Avoid_: edge, arrow, link, connector, relation, line (that is what a picture draws)

**Whole-module endpoint**:
The end of a relationship that names a module with parts and none of those parts, which makes a caller and no entry point.
A module with parts cannot point at anything, so `archboard check` fails on this end with `RELATIONSHIP_ON_CONTAINER`, and the author moves it to the part that owns the code.
The only exception joins a module to a part that it holds.
_Avoid_: port (that is where the renderer attaches a line)

**Flow collection**:
A named group of flows that an author keeps together.
A flow belongs to its collection, not to a module, and its participants can come from anywhere in the model.
_Avoid_: flow file, module flows

**Flow**:
One request, job or event told as an ordered exchange between the modules it names as participants.
Its summary says what the exchange does and why it matters, and its steps say what happens and in what order (ADR 0053).
_Avoid_: sequence (that is a reading of it), data flow, scenario

**Step**:
One thing that happens in a flow: a message, a decision or a loop.
Each step has its own identity, and its position in the flow is part of its meaning.
_Avoid_: call (in a flow), row, line

**Message**:
A step from one participant to another, or to itself, with a label and a kind: `sync`, `return`, `async` or `self`.
_Avoid_: edge, relationship, arrow

**Decision**:
A step that asks a question and goes on in one of two or more alternatives.
The alternatives rejoin after it (ADR 0053).
_Avoid_: branch node, condition, if-step

**Alternative**:
One answer to a decision's question, with its own label and the steps that run on that answer.
_Avoid_: branch, case, arm, path

**Loop**:
A step that repeats the steps it holds while its condition holds.
A count that the source fixes on one message is that message's `repeat`, not a loop.
_Avoid_: repeat (that is a count on one message), iteration

### Meaning

**Vault vocabulary**:
The consumer-defined set of module kinds, relationship kinds and groups that describe architecture across a vault.
It names meaning independently of the vault policy that depicts it.
_Avoid_: palette, theme, model content

**Kind**:
The consumer-defined module type: what sort of architectural unit a module stands for, such as an API, a queue or a third-party library.
A module keeps its kind in every scope.
_Avoid_: category, role, class, drawing shape, level

**External**:
The kind for code that this codebase does not own: a library, a framework, a runtime, a hosted service or a caller outside the checkout.
Outside the open scope does not mean external, because a door can be a module of this codebase.
_Avoid_: third-party kind for our own parts, link node

**Relationship kind**:
The consumer-defined type of an architectural relationship.
_Avoid_: line style, arrowhead, emphasis

**Traffic**:
An optional illustration of flow along a relationship: a steady train of pulses that fly along its line, with independent volume and speed.
It is neither measured real-world activity nor the importance of the relationship.
_Avoid_: emphasis, pulse count, shot

**Traffic volume**:
The authored rate of a relationship's traffic.
It is not a count of marks on the line.
_Avoid_: dot count, shot rate, traffic speed

**Traffic speed**:
How fast a pulse flies along a relationship.
A longer line takes a pulse longer to cross, and a higher speed is a faster line.
_Avoid_: traversal duration, traffic volume

**Emphasis**:
The author-declared importance of a relationship in the model's explanation, independent of its kind and its traffic.
_Avoid_: traffic volume, line weight

**Code binding**:
The optional association between a module and its primary code location: a repository identity, a path, and an optional symbol, branch or commit.
It belongs to the module's meaning, and a module has at most one (ADR 0046).
_Avoid_: link, mapping, reference, pointer, association, logical address

**Code path**:
The repository path that a card shows: the path of its code binding, or the folder that the parts of an unbound container share.
It never establishes identity or containment.
_Avoid_: binding (that is authored), source link

**Anchor**:
The one place in code that an author cites as proof of a relationship or a flow step: a repository, a file in it and a symbol in that file.
It is bookkeeping, so comparison ignores it, and the code check holds it to the code (ADR 0046).
_Avoid_: evidence (that is what the code check finds), citation, source line, proof, location, binding (that belongs to a module)

**Document reference**:
One file in a repository that a module or a state names, such as a design document, an ADR, a task or a plan: a repository identity, a path, and the branch or commit of its version (ADR 0054).
_Avoid_: link, attachment, citation, binding (that belongs to a module), anchor (that proves a relationship)

**Model reference**:
An explicit reference that a module holds to one subject of a model, naming its repository, model, subject and state.
It gives read navigation only, so it establishes no containment and transfers no ownership (ADR 0066).
_Avoid_: drill-down, link, cross-board link

**Symbol**:
A name that code or infrastructure defines or references, such as a definition in code or the address of a declaration in infrastructure.
A code binding can name the definition that its module stands for, and an anchor always names a symbol (ADR 0046).
_Avoid_: identifier, address alone, line, fragment

**Code target**:
The action that a code binding offers a user.
It is derived anew for this machine and is never part of the model.
_Avoid_: binding, persisted link, file URL, local binding, remote binding

**Opener**:
The machine-wide choice of application that opens a code target inside a registered checkout.
_Avoid_: editor, file handler, command

**Repository identity**:
What a repository is called in a way that is the same in every clone and on every machine: its host, owner and name.
A repository with no remote takes the directory name of its main checkout, so all its worktrees share one identity.
_Avoid_: repo URL, remote, origin, project, package

**Checkout**:
One copy of a repository at a path on one machine.
_Avoid_: clone, working copy, workspace, local repo

**Checkout registry**:
The machine-local record of every known checkout with its repository identity, of every untracked vault, and of the chosen checkout of each identity.
It owns no architecture content, and it is the only place that writes down a directory of this machine.
_Avoid_: index, cache, catalogue, repo config

**Chosen checkout**:
The one checkout of a repository identity that this machine reads for it.
Anything that names that identity from another vault resolves there (ADR 0049).
_Avoid_: default checkout, primary checkout, active checkout, project

### Structure

**Group**:
A concern that a module belongs to, defined once in the vault configuration with a stable id, a display name and a color: an effort, a team, a migration or a family of modules.
A module can be in several groups and inherits none from its parent, and a group is independent of containment and of kind.
_Avoid_: category, layer, swimlane, label, region

**Interface**:
A container's entry points in one state, derived from the relationships and never authored.
It says which parts callers reach, not everything a caller must know and not what the code exposes (ADR 0044).
_Avoid_: API, surface, contract, public parts, declared interface (that is what the code exposes), drawn interface

**Entry point**:
A child of a container that a relationship from outside the container reaches, on the child or on a module inside it.
An entry point is always a child, so a nested container answers for its own children.
_Avoid_: endpoint (either end of a relationship), port (where the renderer attaches a line), export, public part

**Hidden part**:
A child of a container that no relationship from outside the container reaches.
Entry points and hidden parts divide a container's children between them.
_Avoid_: private part, internal part, implementation detail

**Caller**:
A module outside a container where a relationship into the container starts, whatever the relationship's kind.
A relationship that ends on the container itself makes a caller and no entry point, so an author moves it to the part that answers the call.
_Avoid_: client, consumer, dependent, user (that is whoever reads the canvas)

**Interface change**:
What a comparison says moved in a container's interface: an entry point added or removed, a part that moved into or out of the interface, or a caller gained or lost.
It costs every caller, so a comparison states it first, and it sets no comparison status (ADR 0044).
_Avoid_: breaking change, API diff

**Pass-through entry point**:
An entry point with no children that sends exactly one relationship, of the same kind as every relationship it receives.
The model shows its shape and not what its body does, so it is a question for the user, never a fault.
_Avoid_: wrapper, proxy, facade, shallow part

**Pass-through container**:
A module with parts and no code binding, which no relationship or flow names, and whose parts no relationship or flow joins.
It is a warning, because it has no code and no job of its own.
_Avoid_: layer, empty container

**Interface measures**:
The counts of one container in one state: its entry points, hidden parts, callers, outgoing relationships and pass-through entry points.
They say what the model claims about the container and are never combined into one score.
_Avoid_: scorecard, depth score, metrics

**Group boundary**:
The relationships with a member of a group at exactly one end, and the modules at their far ends.
It follows the members, not the containers around them.
_Avoid_: group interface, region, group edge

**Design lens**:
A read that states facts about a design and gives no verdict: an interface, an interface change, locality or a branch footprint.
_Avoid_: score, audit, lint

**Vault policy**:
The vault configuration that holds the vault vocabulary and how each word looks: its name, icon, color, dash and arrowhead.
It changes how a model looks and never what it means.
_Avoid_: visual policy, model content, style override

**Color palette**:
The curated set of named colors available to a vault policy.
_Avoid_: vault vocabulary, group

### The surface

**User**:
Whoever reads the canvas and talks to it.
A user reads, picks things out and speaks, and agents author.
_Avoid_: person, human, operator, viewer

**Archboard server**:
The one process on a machine that serves every vault, the panes in the browser and Codex for the agents.
Every call names the vault that it means, and a worktree of Archboard itself runs its own server.
_Avoid_: canvas server, canvas (that is the surface), host, backend

**Pane**:
One of the side-by-side slots that each hold their own canvas, so that two readings can stand side by side.
_Avoid_: split, view, tab, panel, frame, window

**Canvas**:
The live, pannable and zoomable surface in a pane that shows one reading at a time.
_Avoid_: scene (that is what the renderer core answers), board, workspace, session, drawing area

**Left column**:
The column that lists where to go: Find, the repository switcher, the destinations `Modules`, `Flows`, `Walkthroughs`, `History` and `Measures`, and Talk.

**Measures**:
The dialog that checks the reading on screen against its code and its history. It shows where the model and its code disagree, one finding at a time. It also lists every module of the model on show in two tables, sorted by one count at a time. One table holds its interface measures. The other holds its commits, the modules it changes with and its unjoined pairs.
The user can read the most first or the fewest first, and can show all modules, those with parts or those with no parts.
A module with no such count stays last, and a column that is none on every module has no place.
A tie between counts of pairs goes to the module whose strongest pair shares the most commits.
A module with parts counts the commits of its whole code path.
The Right panel of a selected module lists the modules that it changes with, each with its shared commits and a mark where no relationship joins the two.
It shows counts only: no score combines them, and the user judges them (ADR 0044).
_Avoid_: ranking, scorecard, hotspot list

**Diagram reading**:
A reading on the page that shows its picture, beside About.
_Avoid_: board, view

**About**:
The page of a reading that holds its long lists and names whether it describes the open scope or the selected subject.
_Avoid_: inspector, details

**Picture**:
What a reading draws: the open module with its parts and doors, or one flow.
The projection decides it, so the browser, the command line and every render draw the same picture.
_Avoid_: board, diagram, screenshot

**Card**:
The compact depiction of a module with no children shown inside it in the selected reading.
It is a presentation of a module, not a kind of module.
_Avoid_: node, leaf kind

**Container**:
A module that holds modules.
A reading draws it open as a frame or closed as a card, and it keeps its kind, its identity and its interface either way.
_Avoid_: container kind, group, platform tag

**Frame**:
The outline that a picture draws around the parts of an open module or an expanded module: a well with an edge tab on its top edge.
_Avoid_: box, region, lane, group

**Well**:
The floor of a frame, cut into whatever holds it, with the frame's parts standing on it.
_Avoid_: tray (that is a plate at the foot of a column)

**Edge of the well**:
The top edge of a well: one line and one inner shadow across its whole width, which runs on under the edge tab and parts the tab from the floor.

**Edge tab**:
The one raised line on the edge of a well that names an open module, with its icon and code path.
Its left side is the side of the frame (ADR 0070).
_Avoid_: header, card (a frame holds none for its own module)

**Foot of a tab**:
The stretch of the edge of the well under an edge tab.
What a frame holds reaches the frame here, and what stands outside reaches it on its outline.

**Door**:
A module outside the open one that holds parts and that a line reaches, drawn as a bright button whose arrow points up, sideways or down by its place in the module tree.
One click opens it, its plus expands it, its tip lists the endpoints behind its lines, and Ctrl with a click selects it.
A module with no parts stands as its card instead, beside the frame (ADR 0070).
_Avoid_: nearby context, external (that is a kind)

**Line**:
The mark that joins a pair of drawn parts in a picture, and it ends on the parts that own it.
One line can hold several relationships, which makes it a joined line, and it has no identity of its own.
_Avoid_: edge, relationship (that is authored), connector, aggregate connection

**Shared trunk**:
The stretch that the lines of one kind between one door and several parts run on together, from three lines each way.
Each line wears its words on its own branch, beside its part and before it joins.
_Avoid_: bus

**Icon chip**:
The icon and its surrounding tile that identify a module's kind.
_Avoid_: comparison badge, card body

**Group tag**:
A bright named tag on a card, and the same tag in the Legend, where a press selects the parts of its group.
A group has no frame or region and no tinted face.

**Legend**:
What explains the marks of a picture: kinds, line types and groups.
It always stands at the foot of the Right panel on a Diagram reading, over the engine switch.
_Avoid_: Key, filters

**Right panel**:
The permanent right column of a Diagram reading, which shows the open module or the selected subject, with its interface line, the flows and walkthroughs that touch it, and its Trace controls.
The Legend and the engine switch close it, and long lists stay in About.
_Avoid_: inspector

**Interface line**:
The line of the Right panel that counts the entries, callers and pass-through entry points of a module with parts, and `to module` when callers reach the module itself.
Its hidden parts stand apart under Implementation, because they are not part of the interface.
Each count selects what it counts on the module's picture, and no score combines them.

**Entries**:
The count of a container's entry points, as the interface line and Measures write it.

**To module**:
The count of distinct callers whose relationship ends on a module itself and names no part, as the interface line and Measures write it.
It states a fact, not a warning.

**Caption**:
The one line over a picture, which states the open module's responsibility or a flow's collection and summary.
It also holds the comparison control, and `Clear focus` while a focus stands.
_Avoid_: subtitle, narrative

**Crumbs**:
The containment path from the root to the open module in a pane's header.

**Folded chain**:
A chain of modules with one part each, which the module tree shows as one row and the crumbs show step by step.

### Reading

**Reading**:
A content-free selection of what to draw: its model, state or checkpoint, scope, expanded modules, focus, filters, grammar and optional flow.
It owns no architecture, so agents and users compose readings on demand and nobody authors one first.
_Avoid_: view, board

**Scope**:
What a reading examines: one open module, or, with no module open, the root modules.
Changing the scope changes the reading and leaves the architecture as it is.
_Avoid_: level, zoom, board, view

**Open module**:
The module that a reading has open, whose parts it shows with their own internals closed.
Opening a module changes the scope and nothing else, and it works again on any part that has children.
_Avoid_: drill-down, zoom in, descend, board

**Expanded module**:
A module that a reading opens beside its open module, in the same picture, as another frame with its parts.
Expanding a door keeps the scope, and a line to that module then ends on the part that owns it.
_Avoid_: second scope, drill-down, merged view

**Root reading**:
The reading with no open module, which nobody authors.
It draws the root modules of a model, each one closed.
_Avoid_: overview, whole board, summary view, default view

**Focus**:
A reading narrowed to exact chosen subjects and their mutual lines, where the rest become doors, or cards when they hold no parts.
It changes the reading and never creates a module or changes containment.
_Avoid_: zoom, isolate, spotlight

**Selection**:
The subjects that a user picked out in a pane, held by stable identity.
It is presentation, so it stays out of the address, adds no browser history and writes nothing.
_Avoid_: highlight, focus (that is part of a reading)

**Filter**:
A choice in a reading to hide a relationship kind.
It acts on relationships before they join, and the model keeps every relationship.
_Avoid_: legend (that explains the marks)

**Grammar**:
What a reading draws its subject as: `architecture`, `sequence` or `flowchart`.
_Avoid_: diagram type, layout, mode

**Sequence reading**:
A reading in the `sequence` grammar.
It draws one flow's participants as columns and every message in order, a decision as an `alt` frame and a loop as a `loop` frame.
_Avoid_: sequence view, data-flow view, sequence diagram (for the reading)

**Flowchart reading**:
A reading in the `flowchart` grammar.
It draws one flow's steps from a start to an end: a message as a box, a decision as a diamond with a labelled line for each alternative, and a loop as a hexagon (ADR 0053).
A run of steps that is too tall for the pane breaks into columns side by side (ADR 0073).
_Avoid_: flowchart view, logic view, decision tree, activity diagram

**Projection**:
The one shared derivation that turns a coherent reading of a model into what the renderer draws.
The browser and the server use the same rules, and nothing stores the result as architecture.
_Avoid_: view model, board document, copy

**Accepted scene**:
The one scene that a pane draws, held with the model revision, projection, reading and selected identities that produced it.
A requested destination stays separate until its matching scene arrives, and a late result never replaces a newer destination.
_Avoid_: latest scene

**Start**:
The one decision about what a page opens, made before any pane exists (ADR 0069).
The address decides first, then the last reading, then one listed repository with a model, then the repository chooser.
_Avoid_: default vault, served vault, landing page

**Last reading**:
The address of the most recent reading in one browser, for one server.
_Avoid_: default reading, session restore

**Repository chooser**:
The list of repositories that a page shows after a start that ends with no pane.
_Avoid_: picker, landing page

**Reading direction**:
The way a picture reads across the page: always from the top down.
It is a property of the picture, never of authored content.
_Avoid_: orientation, rotation, layout direction, landscape, portrait

**Reference pane**:
What a picture is measured against: one fixed page shape that the renderer lays every picture out for, so a row of the shell never lays a picture out again.
_Avoid_: viewport, screen, window, canvas size, page

**Fit**:
How large a picture shows whole in the reference pane: the scale that fits it.
It breaks ties between pictures that read equally well, and never outweighs how easily a picture reads.
_Avoid_: density, aspect ratio, zoom (that is the camera's)

**Landing whole**:
How a module's picture first shows: whole in the room of its pane, at no more than a scale of 1.
A sequence or a flowchart keeps a landing of 0.6 on the head of its frame when whole would read smaller (ADR 0070).
_Avoid_: floor, zoom to fit

**Far view**:
What a picture draws below a scale of 0.857: each card keeps its box, and its words grow so that they still read.
_Avoid_: thumbnail, overview

**Far type scale**:
The one size that sets the words of every far card of a picture: what a name of 12 px needs where the picture lands, or less if a card's box holds less.
_Avoid_: card zoom

**Light**:
The attention that a picture keeps around a part that a user picks out or points at, which writes nothing.
It covers the part, its contents, every relationship that touches them, and the modules and containers at their other ends, and the rest recedes.
_Avoid_: highlight, focus mode, dim, spotlight

**Trace**:
A user's question of a selected module, asked with `Trace onward` or `Trace back`: how far does it reach along what it sends to, or back along what sends to it.
Each further hop lights more faintly, a card stands for all that it holds, and nothing is written.
_Avoid_: impact analysis, blast radius, dependency graph

**Dive**:
How opening a module looks: the module's picture stands inside its card, and the camera flies into the card until the picture fills the pane.
Going back out runs the flight the other way, and a flight that cannot happen becomes a Passage.
_Avoid_: drill-down, zoom transition, page transition, animation

**Passage**:
How a move between two pictures looks when the camera has no card to fly through: the two pictures travel as one, sideways to a picture at the same depth, in to a deeper picture and out to a shallower one.
_Avoid_: page transition, slide, crossfade

### States and proposals

**State**:
One identified architecture of a whole model, standing in exactly one lifecycle: current, draft, historical or shelved.
A state keeps its identity and its lasting name through every change of lifecycle.
_Avoid_: variant, version, revision, branch, mode

**Current**:
The optional designation of the state that describes the architecture that exists.
A model has at most one, and a checkpoint alone never selects it.
_Avoid_: latest, default proposal, archive tip

**Planning model**:
A model with no current state, for something nobody has built yet.
It differs from a model that is unavailable or not migrated.
_Avoid_: empty model, unmigrated model

**Adoption**:
Explicitly designating a proposal as the implemented architecture and recording why and when.
A formerly current state stays as history, and a Git merge or an approval never adopts a proposal.
_Avoid_: promotion, rename, merge

**Historical state**:
A formerly current state retained under its name after a successor is adopted.
It refuses ordinary edits, and only a correction changes what it says.
_Avoid_: historical variant, abandoned proposal, snapshot, shelved state (that was never current)

**Shelved state**:
A proposal nobody intends to carry out, retained under its name with everything it says and the reason that somebody let it go.
It stops following its predecessor and refuses edits and adoption.
_Avoid_: shelved variant, abandoned, archived, deleted, closed, rejected, superseded (that is a historical state), withdrawn

**Proposal**:
One independently identified draft state: a change nobody has built yet, stored as identity changes against a retained baseline.
Independent proposals can share a name and stay independent identities (ADR 0067).
_Avoid_: plan, design, RFC, draft variant

**Predecessor**:
The state that a proposal follows.
A child proposal follows its own predecessor, not another proposal with a similar name.
_Avoid_: parent (that is containment)

**Baseline**:
The exact retained reading that a proposal's changes are stored against.
_Avoid_: snapshot, copy

**Proposal family**:
A proposal with every proposal that follows it, which one operation reconciles together.
_Avoid_: stack, variant tree

**Reconciliation**:
Bringing a proposal up to date with its predecessor while it keeps its own changes.
Independent changes carry through, and conflicting changes stay explicit until settlement.
_Avoid_: comparison, adoption

**Standing**:
The durable record that a proposal holds open issues or waits on a blocked ancestor.
A comparison never establishes it.
_Avoid_: status, conflict flag

**Settlement**:
One explicit choice for every open issue of a proposal, made in one intent.
_Avoid_: merge, automatic resolution

**Comparison**:
The differences between two states, identified by the stable identities of their subjects.
By default, a non-current state compares with current, or with its predecessor in a model with no current state.
_Avoid_: diff, variant, reconciliation

**Comparison status**:
The derived added, changed, removed or unchanged mark of a subject against the state that it is compared with.
_Avoid_: authored flag, selection, current designation, standing (that belongs to a proposal)

**Change list**:
One row for each changed subject of a comparison, under the subject that owns it.

**Walk**:
Moving through a change list in order.

**Place**:
Where a user stands in a walk, which follows the subject's identity, not its position.

**Checkpoint**:
An exact retained copy of a model's authored inputs and their selection metadata, held in Git.
It selects no current state and leaves a checkout's branch, HEAD and index as they are.
_Avoid_: snapshot, backup, commit

**History archive**:
The independent Git record that retains checkpoints and lifecycle records apart from source history.
Its order supplies no architecture ancestry and no current designation.
_Avoid_: history branch, backup

**Publication**:
The explicit transfer of retained architecture to a named remote.
A normal source push does not publish it.
_Avoid_: push, sync, upload

**Correction**:
An explicit change to retained historical meaning, with a reason and immutable source evidence.
It keeps the original record readable and tied to the corrected state.
_Avoid_: edit, amendment, rewrite

### Authoring and recovery

**Intent**:
One complete authorized architecture operation.
It names its operation identity, writer, doing line, exact target and complete expected revision.
_Avoid_: patch, edit

**Doing**:
The one line that an agent says about the model as it writes, shown on the canvas while the write lands.
A claim's reason is the campaign, and a doing is one step of it.
_Avoid_: description, why, message, comment, log, reason (that is the claim's)

**Claim**:
A writer's visible ownership of affected subjects, states and structure scopes while it works.
It permits reading, and a human can take it back.
_Avoid_: lock, lease (that is the short installation hold)

**Installation lease**:
The short vault-wide hold that serializes durable writes.
It stays free between operations, so no agent holds it while it works.
_Avoid_: lock, claim

**Complete revision**:
The fingerprint of every authored input that establishes the selected model.
A writer names a fresh one, not the version of a selected file, so a change based on an older read is refused.
_Avoid_: version, read token, generation, sequence, edition, variant

**Pending transaction**:
An accepted write that stopped before durable completion, so ordinary reads refuse with `RECOVERY_REQUIRED`.
Explicit recovery finishes it from the original operation and checkout.
_Avoid_: partial write, crash state

### Commands

**Model operation**:
An action whose subject is the model of a named vault.
It goes through the shared runtime and needs no live canvas, pane, selection, camera or connected browser.
_Avoid_: board operation, canvas command, pane command, headless command

**Browser operation**:
An action whose subject is a live Archboard browser session: showing a reading in a pane, opening or closing a pane, or reading what each pane shows and what the user selected.
It never changes the model.
_Avoid_: view command, board command, pane command

**Render**:
An image of one reading drawn without a live pane: an SVG from the renderer, or a PNG captured from that reading.
It carries its render recipe, so it can be drawn again and compared.
_Avoid_: board render, screenshot, pane export, artifact, export

**Render recipe**:
What a render records about how it was drawn: the model identity, the reading selectors, the input revision and the picture digest.
It holds no output path, and it names subjects by identity, not by the name somebody typed.
_Avoid_: render request, render settings, command, export options

**Embed**:
A render that a repository keeps under Git, so that a document can show it.
The embeds check finds it by its render recipe, and a render that Git does not track is no embed.
_Avoid_: artifact, export, tracked render, tracked embed, asset

**Renderer core**:
The Rust crate that measures, lays out and paints a reading.
Bun and the browser load it as WebAssembly, and a native frontend links it (ADR 0059).
_Avoid_: engine (that is a layout engine), WASM module

**Layout engine**:
The part of the renderer core that places a picture's cards and routes its lines.
Blocks is the default, and Tracks is the alternative, which the switch in the Right panel offers and a render asks for with `--layout track` (ADR 0064).
_Avoid_: renderer core, layout mode, Track (`track` is only the value of a flag or a field)

**Dense placement**:
What Blocks tries first on a reading of one open frame of cards, or of a root with 18 or more lines: the parts start on a grid, and the doors stand round the frame.
A reading that it cannot route, or that holds a nested frame, keeps legacy placement.
_Avoid_: compaction (that closes the space nothing uses in a routed drawing, so its parts need not stay on the grid)

**Scene**:
The ordered, positioned list of what a picture is made of: shapes, glyph runs and the marks that a painter animates.
The renderer core answers it, and it holds no interaction state, so it is never the canvas that shows it.
_Avoid_: paint list, display list, render tree, canvas

**Painter**:
What turns a scene into what a frontend shows.
The SVG painter is part of the renderer core, and a native frontend paints the list itself.
_Avoid_: rasterizer (that makes a PNG from SVG), backend

### Commits

**Locality**:
The answer to which bound modules change often and which change together, read from Git on request.
_Avoid_: behind, staleness, drift, freshness

**Hotspot**:
A module that many commits in a period changed.
The count is of commits only, not of the size or the complexity of the code, and it leaves large commits out (ADR 0045).
_Avoid_: churn (that counts changed lines), heat, activity, hot path, window (that is a browser window)

**Change coupling**:
Two modules whose bound declarations or paths change together often enough to pass code-maat's filters.
A pair that nothing in the model joins asks whether the model misses a dependency, or whether two modules carry one decision (ADR 0045).
_Avoid_: temporal coupling, logical coupling, evolutionary coupling, co-change

**Branch footprint**:
The modules whose bound declarations or paths a local source range changed, set against the modules that a selected proposal names (ADR 0045).
_Avoid_: footprint alone, impact, change set, touched parts, diff (that is a comparison)

**Large commit**:
A commit that changes so many files that it makes unrelated modules look coupled.
Hotspots and change coupling leave it out, and a branch footprint keeps it and says that it is large (ADR 0045).
_Avoid_: sweep, bulk commit, big commit

### Evidence

**Semantics check**:
Reading a vault's model against the vault's own configuration.
It reads no code and no Git.
_Avoid_: plain check, board check, vault check, lint

**Embeds check**:
Reading the embeds of a repository against the models that they draw, to say which embed is outdated or lost its subject.
It can draw each outdated embed again from its render recipe.
_Avoid_: artifact check, render check, docs check

**Code check**:
Comparing, on request, what a state claims with the code and infrastructure that its code bindings and anchors name.
It reports findings on the current state or on a selected proposal (ADR 0046, ADR 0068).
_Avoid_: code inspection, lint, scan, drift detection, the check alone (that runs every check)

**Code facts**:
What one file tells the code check: what it defines, with the visibility of each definition, what it references and what it imports.
They are derived from the file on request and never written to a file (ADR 0046).
_Avoid_: index, symbol table, syntax tree, parse result

**Evidence kind**:
What one piece of code or infrastructure proves about two modules: a call, a configured path, a permission, an import, a build dependency or provisioning.
Each relationship kind can name the evidence kinds that it accepts (ADR 0046).
_Avoid_: relationship kind (that is what the model claims), link type, dependency type, path alone

**Use as a value**:
A use at run time that runs none of the name's code, such as reading a constant or testing a value against a class.
It is call evidence, so it supports a relationship, and the code check never calls a dependency undrawn on it alone (ADR 0046).
_Avoid_: read, weak call, reference (that is any use)

**Candidate**:
Evidence that the code check matched by name only, so the name can stand for another definition.
A finding on a candidate is information, never a warning (ADR 0046).
_Avoid_: match, hit, guess, possible finding, unresolved evidence

**Finding**:
One thing that the code check reports about one module, relationship or flow step, with the evidence that it rests on.
Its severity is warning or information (ADR 0046).
_Avoid_: diagnostic (what the semantics check reports), issue, violation, drift, problem

**Source excerpt**:
The lines of a file around one piece of evidence that a remembered finding names: the evidence line, with up to 3 lines on each side.
It is the only text of a file that Archboard quotes, within the limits of the amendment of 2026-11-07 to ADR 0046.
_Avoid_: snippet, preview, code context, quote

### Walkthroughs and voice

**Walkthrough**:
An authored sequence of beats that explains a state or a retained checkpoint of a model.
It holds no geometry and no copy of the architecture.
_Avoid_: variant, flow

**Beat**:
One stop of a walkthrough: its title, its narrative and its complete reading.
It inherits nothing from the beat before it.
_Avoid_: step (that belongs to a flow), slide

**Walkthrough box**:
The plate that a presented walkthrough lays over the foot of its pane's picture.
It holds the beat's number, title and narrative, the keys that step and leave, and a rail of beats, and the browser alone owns it.
_Avoid_: caption strip, presentation bar, subtitle bar

**Narration**:
A voice session that explains one walkthrough while the user steps through it by hand.
The position stays the pane's, and the words follow the picture.
_Avoid_: playback, autoplay, slideshow

**Recording**:
One walkthrough presented from its first beat to its last with nobody at the controls, written to a video file with the voice explaining it.
It keeps a talk, and the video's picture is then rendered from the talk, frame by frame.
_Avoid_: playback, autoplay, screencast, export

**Talk**:
What a recording keeps of its live pass: the voice's sound, the events counted in samples of that sound, and the input that draws the picture.
It renders again without the model, Codex or a new voice session, and it is not the Talk control that starts voice.
_Avoid_: take, capture, session, transcript (the conversation's record), video (that is the recording)

**Subtitle**:
What the voice model is saying, laid over the picture of the pane that voice runs for, one cue of two lines at a time.
It is presentation, the browser's own, and what the user says is never subtitled.
_Avoid_: caption, transcript (the conversation's record)

**Voice box**:
The subtitle's box with the voice in it: the orb, its state in a word, mute and the subtitles control, over the picture of the pane that voice runs for.
While a walkthrough is presented, it stands in the foot of the walkthrough box.
_Avoid_: caption box, voice panel, subtitle bar

**Pane news**:
Where a user's reading of a pane stands after they changed it by hand, told to the voice model as one sentence of names.
A change that an agent or the canvas caused is never pane news.
_Avoid_: callback, telemetry, event, selection report

**Outside change**:
A model change by an agent that is neither the workhorse nor the voice coordinator of this tab session.
The voice model and the coordinator are both told, because neither asked for it.
_Avoid_: external edit, foreign write, third-party change

### Working

**Tab session**:
The work of one browser tab with Codex: one voice coordinator for the whole app and one workhorse for each checkout that the tab works in.
A reload keeps it, and a new tab or window starts a new one.
_Avoid_: browser session (that names the realtime handle), session alone, canvas

**Workhorse**:
The Codex thread of a tab session that works in one checkout, for architectural inspection, analysis and proposals.
It runs in that checkout's directory, so it reads that repository's own agent instructions and skills.
_Avoid_: main agent, coding thread, backend agent, worker (that is also an agent role)

**Thread link**:
The runtime association between one tab session, one checkout and one controllable Codex workhorse.
It never lives in the model or follows the active thread of another client.
_Avoid_: binding (that means module to code here), attachment, selected thread, active task, task link

**Voice coordinator**:
The fast Codex thread beside the workhorses of a tab session, which serves the whole app and works in no checkout.
With the voice model it is one assistant: the voice model speaks, and the coordinator reads the architecture, follows its workhorses and decides what the voice model says.
_Avoid_: voice model (that is only one part of the realtime path), voice agent, router, facilitator, copilot

**Voice model**:
The realtime speech model that the user talks to.
It listens and speaks, and it hands off to the voice coordinator for anything that needs architecture or work.
_Avoid_: voice coordinator, voice agent, assistant

**Handoff**:
The voice model passing the conversation to the voice coordinator and waiting for its answer.
It carries what the user last said or, with nothing said, the voice model's own words, which are never a request.
_Avoid_: delegation (that is the coordinator giving work to the workhorse), request, callback

**Spoken answer**:
What the voice coordinator gives the voice model to say to the user, as the result of a handoff.
Apart from a narration's steps and news that stops a narration, all else reaches the voice model as quiet context.
_Avoid_: final, reply, response

**Steer**:
To add input to a turn that is still running, so that the turn takes it into account as it continues.
Steering never stops the turn.
_Avoid_: interrupt, inject, cancel

**Workhorse stop**:
A request to interrupt the running turn of the workhorse of one checkout, or of every workhorse of a tab session.
A sent interrupt does not prove that work stopped: only workhorse news that its turn ended proves it.
_Avoid_: steer, pause, end voice

**Shown conversation**:
The workhorse conversation that the agent dock of every pane of a tab shows: the one of the checkout that the user last activated.
Nothing that an agent does to a pane changes it (ADR 0050).
_Avoid_: active thread, current conversation, selected thread

**Workhorse news**:
What the voice coordinator hears about the workhorses of its tab session while voice is live: a turn that ended or waits on the user, and a message that a workhorse sent it.
_Avoid_: callback, notification, outcome report

**Pane report**:
What a pane says about what it shows: the exact capture of its vault, model, selected identities, reading intent and observed revisions.
_Avoid_: screenshot, pane snapshot

**Agent navigation**:
An agent moving a pane to an addressed reading, which the browser then renders locally.
It never activates another conversation.
_Avoid_: remote render

**Explanation**:
Temporary text that a local agent returns for one captured reading.
It stays tied to that reading and authors no architecture.
_Avoid_: annotation, note

### Legacy formats

**Legacy board**:
A document of the format that the model replaced: one description of one subject with its own level, views, drill-downs, variants and version.
It is not part of the live model, and the runtime decodes it only for migration and exact retained history.
_Avoid_: board (for anything live), note

**Original state**:
One state of a legacy board, retained exactly and opened with its own coverage only.
It is not part of the live model, and it never borrows present-day modules around it.
_Avoid_: variant, historical state (that is a state of the model)

**Bookmark**:
A named reading that migration keeps from a legacy view, which owns no architecture.
It is not part of the live model, and basic navigation never depends on one.
_Avoid_: view, named view

**Legacy address**:
An exact address from a legacy board that the captured aliases of a migration still resolve to one original state.
It is not part of the live model, and an unknown or ambiguous address refuses.
_Avoid_: board address, alias

### Migration

**Legacy authority**:
The standing of a vault that still holds legacy boards, so ordinary live operations refuse it with `LEGACY_AUTHORITY`.
Only an explicit migration changes it.
_Avoid_: unmigrated model, compatibility mode

**Inventory**:
The record of every original identity and the exact fingerprint of its source, taken before any mapping.
_Avoid_: scan, import

**Mapping plan**:
The owner's explicit identity decisions and reasons for a migration (ADR 0066).
The runtime never infers a mapping from a name or a binding.
_Avoid_: automatic mapping, migration configuration

**Preview**:
The composed reading of a mapping plan, which rewrites no original file and changes no live authority.
_Avoid_: dry run, candidate (that is evidence that the code check matched by name)

**Migration**:
The explicit, authorized installation of a mapped model, which retains the originals first and replaces legacy authority.
_Avoid_: upgrade, automatic rewrite
