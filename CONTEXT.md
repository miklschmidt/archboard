# Archboard

A shared architecture surface. Agents author a codebase's architecture on boards
that express its meaning, and users read them.

## Language

### The surface

**Board**:
A semantically named description of one architectural subject or question at one
abstraction level. A board owns its shared views and the tree of variants recording
how that diagram evolves.
_Avoid_: document, drawing, diagram, whiteboard, sketch

**Former name**:
A name a board or variant had before it was renamed. It keeps opening what it
named — a drill-down on another board, a saved pane address, a command — and no
other board may take it; the board's own name always wins over another's former
one. A rename changes a name and nothing else (ADR 0036).
_Avoid_: alias, old name, redirect

**Canvas**:
The live, pannable and zoomable surface on which exactly one board is open at a
time for exploration and inspection.
_Avoid_: scene, workspace, session, drawing area

**Archboard server**:
The one process on the machine that serves every vault. It serves the vault of
every registered checkout and untracked vault, the panes in the browser, and
Codex for the agents. The first command that finds none starts it, and every call
names the vault that it means. A worktree of archboard itself runs its own
server, from its own source, on a port of its own.
_Avoid_: canvas server, canvas (that is the surface), host, backend

**View**:
A named way of reading a board, with a shared diagram grammar and scope across
every variant. The view stays the same while the selected variant supplies the
architectural content.
_Avoid_: board, pane, variant

**Overview**:
The reading a board opens on, which nobody authors (ADR 0052). It draws the
root parts, and every container is closed. The board is the container of its
subject, so no part stands for the board itself. All relationships from one drawn part to another are one
line. A line that joins several stacks their labels. It draws no line between a container and a part that it holds.
_Avoid_: whole board, summary view, default view

**Everything**:
The reading of every part and every relationship, asked for as the view of
that name. No authored view can be called Overview or Everything.
_Avoid_: whole variant (in a reader's words), all view

**Grammar**:
What a view draws its scope as: `architecture`, `sequence` or `flowchart`.
_Avoid_: diagram type, layout, mode

**Sequence view**:
A view in the `sequence` grammar. It draws one flow's participants as columns
and every message in order, a decision as an `alt` frame and a loop as a
`loop` frame. The grammar was called `data-flow` before schema 2.5.0.
_Avoid_: data-flow view, sequence diagram (for the view)

**Flowchart view**:
A view in the `flowchart` grammar. It draws one flow's steps from a start to an
end: a message as a box, a decision as a diamond with a labelled line for each
alternative, and a loop as a hexagon (ADR 0053).
_Avoid_: logic view, decision tree, activity diagram

**Pane**:
One of several side-by-side slots, each holding its own canvas, so that two
boards can be worked on at once.
_Avoid_: split, view, tab, panel, frame, window

**User**:
Whoever is reading the canvas and talking to it. A user reads, picks things out
and speaks; agents author.
_Avoid_: person, human, operator, viewer

**Node**:
An architectural unit described on a board, with an identity and kind independent
of how it is drawn. It has a name and may carry a short responsibility and a detailed
description.
_Avoid_: box, component, entity, vertex, block

**Edge**:
A connection between two nodes standing for a dependency, call, or flow.
_Avoid_: arrow, link, connector, relation, line

**Flow**:
One request, job or event told as an ordered exchange between the nodes it
names as participants. Its steps say what happens, in what order, and under
which condition (ADR 0053).
_Avoid_: sequence (that is a reading of it), data flow, scenario

**Step**:
One thing that happens in a flow: a message, a decision or a loop. Each step
has its own minted id, and its place in the flow is part of its meaning.
_Avoid_: call (in a flow), row, line

**Message**:
A step from one participant to another, or to itself, with a label and a kind:
`sync`, `return`, `async` or `self`.
_Avoid_: edge, relationship, arrow

**Decision**:
A step that asks a question and goes on in one of two or more alternatives.
The alternatives rejoin after it (ADR 0053).
_Avoid_: branch node, condition, if-step

**Alternative**:
One answer to a decision's question, with its own label and the steps that run
on that answer.
_Avoid_: branch, case, arm, path

**Loop**:
A step that repeats the steps it holds while its condition holds. A count that
the source fixes on one message is that message's `repeat`, not a loop.
_Avoid_: repeat (that is a count on one message), iteration

**Card**:
The compact depiction of a node with no children shown inside it in the selected
reading. It is a presentation of a node, not a node kind.
_Avoid_: node, leaf kind

**Container**:
A node that has children on a variant. A view that shows its children draws it
expanded, enclosing them, and a view that shows it alone draws it as a card.
Either way it keeps its kind, its identity and its interface.
_Avoid_: container kind, group, platform tag

**Icon chip**:
The icon and its surrounding tile identifying a node's kind on a card or container.
_Avoid_: comparison badge, card body

### Commands

**Board operation**:
An action whose subject is an explicitly named Board. It resolves the Board's
Note directly and needs no live Canvas, Pane, selection, camera, or connected
browser.
_Avoid_: canvas command, pane command, headless command

**Browser operation**:
An action whose subject is a live Archboard browser session: showing a Board in
a Pane, opening or closing a Pane, or reading what each Pane shows and what the
user selected. It never changes a Board's Note.
_Avoid_: view command, board command, pane command

**Board render**:
An image of one named Board drawn without a live Pane: an SVG from the renderer,
or a PNG drawn in a private headless browser. It never attaches to a browser
session. It carries its Render recipe, so it can be drawn again and compared.
_Avoid_: screenshot, pane export, artifact, export

**Render recipe**:
What a Board render records about how it was drawn: the Board, the variant or
"current", the view, the comparison, and the drawing choices such as theme and
legend. It is not the command line: it holds no output path, and it names a
variant or a view by id, not by the name somebody typed.
_Avoid_: render request, render settings, command, export options

**Embed**:
A Board render that a repository keeps under Git, so that a document can show
it. It carries its Render recipe, and the embeds check keeps it current. A
render on stdout, on the clipboard or in a folder that Git ignores is no embed.
_Avoid_: artifact, export, tracked render, asset

**Tracked embed**:
An Embed that its Board lists, so that the Board's side knows where the picture
is shown, also in another repository. Somebody asks for each one: no Embed is
tracked by default.
_Avoid_: tracked render, subscription, registered embed

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
An optional illustration of flow along a connection: a steady train of pulses
that fly along its line, with independent volume and speed. It is neither
measured real-world activity nor connection importance.
_Avoid_: emphasis, pulse count, shot

**Traffic volume**:
The authored rate of a connection's traffic. With the traffic speed it sets how
far apart the pulses are: the speed divided by the volume, within limits. A
pulse flies twice the authored speed, so pulses reach the end of the line twice
as often as the volume says. It is not a count of marks on the line.
_Avoid_: dot count, shot rate, traffic speed

**Traffic speed**:
How fast a pulse flies along a connection, in diagram units per second. A pulse
flies twice the authored speed (held between 8 and 600), and the distance
between two pulses is the authored speed divided by the volume. A longer line
takes a pulse longer to cross, and a higher speed is a faster line.
_Avoid_: traversal duration, traffic volume

**Emphasis**:
The author-declared importance of a connection in the board's explanation,
independent of its relationship kind and traffic.
_Avoid_: traffic volume, line weight

**Binding**:
The optional association between a node and its primary code location. Each node
has at most one binding, and two nodes on one board can name different repositories.
A binding can name a symbol: the definition at its path that the node stands for
(ADR 0046).
_Avoid_: link, mapping, reference, pointer, association

**Anchor**:
The one place in code that an author cites as proof of a relationship or a flow
step: a repository, a file in it and a symbol in that file. It is bookkeeping.
Comparison ignores it, and the code check holds it to the code (ADR 0046).
_Avoid_: evidence (that is what the code check finds), citation, source line,
proof, location, binding (that belongs to a node)

**Document reference**:
One file in a repository that a variant draws, such as a design document, an
ADR, a task or a plan: a repository identity and a path, and the branch or
commit of the version that the variant draws. A variant holds a list of them,
and a branch copies the list (ADR 0054).
_Avoid_: link, attachment, citation, binding (that belongs to a node), anchor
(that proves a relationship)

**Symbol**:
A name that code or infrastructure defines or references: a definition or a
reference in code, or the address of a declaration in infrastructure or Nix,
such as `Deployment/checkout`. A binding can name the definition that its node
stands for, and an anchor always names a symbol (ADR 0046).
_Avoid_: identifier, address alone (a logical address names code on any
machine), line, fragment

**Code target**:
The action offered when a user activates a binding. It is derived anew for
this machine and is never part of the board.
_Avoid_: binding, persisted link, file URL, local binding, remote binding

**Opener**:
The machine-wide choice of application used to open a code target that resolves
inside a registered checkout.
_Avoid_: editor, file handler, command

**Logical address**:
A machine-independent way of naming code: a repository identity and a path
within it. A binding can also name the symbol at that path, and the branch and
commit at which the binding was last confirmed.
_Avoid_: path, file reference, location, URI

**Repository identity**:
What a repository is called in a way that is the same in every clone and on
every machine: host, owner and name, taken from its `origin` remote. A
repository with no remote is called by the directory name of its main checkout,
so all its worktrees share one identity.
_Avoid_: repo URL, remote, origin, project, package

**Checkout**:
One copy of a repository sitting at a path on one machine.
_Avoid_: clone, working copy, workspace, local repo

**Checkout registry**:
The machine-local record of every checkout known here, each with its repository
identity, of every untracked vault with its registry name, and of the chosen
checkout of each identity. The only place a directory on one machine is written
down.
_Avoid_: index, cache, catalogue, repo config

**Chosen checkout**:
The one checkout of a repository identity that this machine reads for it. The
browser reads its vault, and a binding or drill-down that another vault makes
into that identity resolves there. A binding into a vault's own repository
resolves in the vault's own checkout instead. A person changes the choice with
`repo use` or the navigator's menu, and an agent's `browser show` from another
checkout of the identity changes it too, and so does a finished `semantic move`
into a checkout that is not chosen. No other board command does, nor does a
command that only registers a checkout. An identity whose chosen checkout was
forgotten has none until somebody chooses again, and its bindings resolve as
unregistered.
_Avoid_: default checkout, primary checkout, active checkout, project

### Structure

**Containment**:
One node being structurally part of another, with at most one structural parent.
Containment expresses membership independently of how nodes are drawn.
_Avoid_: lane, frame, rectangle

**Group**:
A concern a node belongs to, defined once in the vault configuration under a
stable readable id with a display name and a colour: an effort, a team, a
migration, a family of parts. A node's memberships are an explicit set of those
ids; a node may be in several groups, inherits none from its parent, and a group
is independent of containment and of kind. Renaming a group changes no board. Inspecting a group
reads its members, the relationships between them, the relationships crossing its
boundary and their direction, and the immediate neighbours those reach.
_Avoid_: tag, category, layer, swimlane, label

**Interface**:
A container's entry points on one variant, derived from the relationships of
the variant and never authored. It belongs to the container, not to a drawing
of it. It says which parts callers reach, not everything a caller must know,
and not what the code exposes (ADR 0044).
_Avoid_: API, surface, contract, public parts, declared interface (that is what
the code exposes), drawn interface

**Entry point**:
A child of a container that a relationship from outside the container reaches,
on the child or on a part inside it. Outside is every part that is neither the
container nor below it. An entry point is always a child, so a nested container
answers for its own children.
_Avoid_: endpoint (either end of a relationship), port (where the renderer
attaches a line), export, public part

**Hidden part**:
A child of a container that no relationship from outside the container reaches.
Entry points and hidden parts divide a container's children between them.
_Avoid_: private part, internal part, implementation detail

**Caller**:
A part outside a container where a relationship into the container starts,
whatever the relationship's kind. A relationship that ends on the container
itself makes a caller and no entry point.
_Avoid_: client, consumer, dependent, user (that is whoever reads the canvas)

**Pass-through entry point**:
An entry point with no children that sends exactly one relationship, of the
same kind as every relationship it receives. The board shows its shape and not
what its body does, so it is a question for the reader, never a fault.
_Avoid_: wrapper, proxy, facade, shallow part

**Design question**:
A question that the Board tab asks of the board on screen: where does
understanding or changing the code take more work than its job needs? Its
answer names subjects and counts them, such as the pass-through entry points.
It gives no score and no verdict. Choosing it lights its answer (ADR 0057).
_Avoid_: smell, lint, warning, score, finding (that is what the code check reports)

**Interface measures**:
Five counts of one container on one variant: its entry points, hidden parts,
callers, outgoing relationships and pass-through entry points. They say what the
board claims about the container. They are the same for every drawing of the
variant and are never combined into one score.
_Avoid_: scorecard (that is how a drawing reads), depth, depth score, metrics

**Visual policy**:
The vault-wide interpretation of semantic vocabulary as appearance, shared by
all boards and variants without changing their architectural meaning.
_Avoid_: board content, variant, style override

**Color palette**:
The curated set of named colors available to a visual policy.
_Avoid_: vault vocabulary, group

**Presentation intent**:
What a board's depiction should explain: its focal subject, main flow, and
diagram grammar. It expresses the intended reading without specifying geometry
or styling.
_Avoid_: coordinates, theme, layout settings

**Level**:
The required abstraction classification of a board, chosen from the vocabulary
defined by the vault's consumer — commonly system, service, module — and
listed there coarsest first, which is how the navigator knows which of two
drilled boards sits above the other. A
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
sideways from a card. Without a repository identity it stays in the vault of the
board that carries it. With one (`repo`, an identity as a binding names it,
never a path) the board is in the vault of that identity's chosen checkout, with
its former names and case-insensitive names as in any vault; an identity that
names the vault's own repository stays in the vault. An untracked vault has no
identity, so no drill-down reaches one.
_Avoid_: zoom in, expand, descend, navigate, open

**Variant**:
One named state in a board's evolution, standing in exactly one lifecycle:
current, draft, historical or shelved. Each successor has one predecessor, and a
predecessor may have several competing successors. Every variant but the current
one shows how it differs from the current variant through the board's shared
views; on a board with no current variant, a draft shows its changes relative to
its predecessor.
_Avoid_: version (that is which edit the board's note is),
revision, branch, mode, state

**Current**:
The designation of the variant that describes the architecture that exists. A
board has at most one. A board for something nobody has built yet has none: every
variant on it is a draft or shelved, and that absence is how the board says nothing it
describes exists. Moving this designation preserves the names and identities of
both states. A board's bare name opens its current variant; on a board with none
it opens the one draft no other draft came before, and asking which variant is
current still answers none.
_Avoid_: latest, default proposal

**Adoption**:
Explicitly designating a variant as the implemented architecture and recording when
the designation changed. A formerly current state is retained as named history; on a
board that had no current variant, adoption is the moment its architecture starts
existing, and nothing becomes history. A proposal built on a state that a later
adoption superseded is adopted only when forced, and the record says so (ADR 0037).
_Avoid_: promotion, rename, merge

**Historical variant**:
A formerly current architectural state retained under its name after a successor
is adopted. It refuses ordinary edits so it preserves what existed. An explicit
correction repairs its description against stated historical Git commits and
records the reason without changing its identity or adoption history.
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

**Walkthrough box**:
The plate a presented walkthrough lays over the foot of its pane's picture. It
holds the step's number, its heading and its words (the caption), the name of
the walkthrough, the keys that step and leave, and a rail of steps that goes to
any of them. At its foot is a pill for the voice: the key that starts a
narration while voice is off, and the voice box while it is live. A recording
and the replay of a kept talk draw it without the keys that step and leave. It
is presentation: the browser's own, written nowhere.
_Avoid_: caption strip (its retired form), presentation bar (the bar over a
fullscreen presentation), subtitle bar

**Narration**:
A voice session started to explain one walkthrough while the user steps
through it by hand. Archboard opens its first step in the pane. It hands the
voice model each step once the pane says the step is on screen, and the voice
explains the step and waits. The position in the walkthrough stays the pane's,
and the words follow the picture.
_Avoid_: playback, autoplay, slideshow

**Recording**:
One walkthrough presented from its first step to its last with nobody at the
controls, written to a video file with the voice explaining it. The page moves
to the next step once the voice finishes the one on screen, and keeps a talk.
The video's picture is then rendered from the talk, frame by frame. A board made
only to be recorded can be discarded once its recording is written
(`--discard`). The one other command that deletes a board is `semantic delete`.
_Avoid_: playback, autoplay, screencast, export

**Talk**:
What a recording keeps of its live pass. It holds the voice's sound, and the
events of the talk, counted in samples of that sound: each step shown, each
change to what the voice said and each board version drawn. It also holds the
board and the vault policy that the picture is drawn from. So it renders again
without the board, without Codex and without a new voice session. It is a
directory of `talk.json` and `voice.wav`. The Talk control, which starts voice,
is another thing.
_Avoid_: take, capture, session, transcript (the conversation's record), video
(that is the recording)

**Subtitle**:
What the voice model is saying, laid over the picture of the pane voice runs
for, one cue of two lines at a time. The transcript arrives a word at a time on
the audio clock, so each word is shown as it arrives, and the subtitle goes once
the voice has been silent longer than it pauses mid-thought. It is presentation:
the browser's own, written nowhere, and the user can turn it off. What the
user says is never subtitled.
_Avoid_: caption (the walkthrough's step text), transcript (the conversation's record)

**Voice box**:
The subtitle's box with the voice in it. While the user wants subtitles and a
voice is live and a box is on the page, the voice's orb, its state in a word,
mute and the subtitles control are in a box over the picture of the pane voice
runs for, beside the words, and the agent dock does not draw the circle: it
gives the voice up only to a box that is there. Turning subtitles off flies the
one orb back to the dock. While a walkthrough is presented the voice box is in
the foot of the walkthrough box. A fullscreen presentation has no dock, so the
box carries the voice there whatever the user wants of subtitles, which then
decide only whether there are words. A recording draws the same voice box at
the foot of its walkthrough box, its orb moved by the recorded voice. It is
presentation, like the subtitle.
_Avoid_: caption box, voice panel, subtitle bar

**Pane news**:
Where a user's reading of a pane stands after they changed it by hand: the board,
variant or view they are now looking at, what they now have selected, or the pane
they moved to. It is told to the voice model as one sentence of names, saying
only what changed, as quiet context. During a narration, a pick or a view or
variant the user chose is told as speech, and the narrator stops for it. A
change an agent or the canvas caused is never pane news.
_Avoid_: callback, telemetry, event, selection report

**Outside change**:
A board change made by an agent that is neither the workhorse nor the voice
coordinator of this tab session. The workhorse of another tab is such an agent,
and so is a write that names no session. The voice model and the coordinator are
both told, when a pane of the tab shows that board. Neither asked for the
change, and what they know of the board is no longer true. Such an agent moving
one of the tab's panes is told the same way, and never as the user's doing.
_Avoid_: external edit, foreign write, third-party change

**Comparison**:
The differences between two board variants, identified by the stable identities
of their architectural content. The current variant is now and is the reference:
a historical, draft or shelved variant's views show its comparison with the
current variant as derived change marks, rather than authored content, and the
current variant shows none. A board with no current variant has no now, so each
of its drafts is compared with the variant it was branched from. Reconciliation
and adoption follow the predecessor, never this reading.
_Avoid_: variant, diff

**Comparison status**:
The derived added, changed, removed or unchanged standing of a subject against
the variant its own variant is compared with: added is only on this variant,
removed is only on the other.
_Avoid_: authored flag, selection, current designation

**Note**:
The `.semantic.json` document in the vault holding one board and its variants.
The note is the authoritative persisted content of the board.
_Avoid_: page, record

**Version**:
Which persisted edit of a board it is, shared by all its variants. A writer
names the version it edited so a change based on an older board can be refused.
_Avoid_: revision, generation, sequence, edition, variant (that is a different
architectural state, rather than the board's edit counter)

**Vault**:
The `.archboard/vault` directory of one checkout, where its boards are kept. A
vault is versioned with its repository, so each checkout has its own copy, and
its boards can describe any repository. A meta project that plans across
repositories is a repository too. A command finds a vault from its working
directory or `-C`, and the server serves no other directory.
_Avoid_: library, workspace, store, repository, folder

**Untracked vault**:
A vault in a directory that is not a git checkout, at `<dir>/.archboard/vault`.
It has no repository identity, so no board in another vault can drill down
into it.
_Avoid_: loose vault, external vault, global vault

### Reading

**Reading direction**:
The way a view's architecture reads across the page: always from the top down.
It is a property of the rendered variant, never of its authored content.
_Avoid_: orientation, rotation, layout direction, landscape, portrait

**Reference pane**:
What a drawing is measured against. Its width is the shell's: a lone pane's
picture at the one supported size, beside its docked sidebar, with the
conversation shut and the fit margin taken off either side. Its height is not
the shell's: it is that width over the page shape the renderer lays boards out
for, a tuned 1.4, so a row of the shell never lays a board out again.
_Avoid_: viewport, screen, window, canvas size, page

**Fit**:
How large a drawing shows whole in the reference pane: the scale that fits it,
capped at one. A guideline: it breaks ties between drawings that read equally
well, and never outweighs how easily a drawing reads.
_Avoid_: density, aspect ratio, zoom (that is the camera's)

**Scorecard**:
Every measure a reader pays for in one drawing. The reading measures decide:
crossings, stacked and double-tracked lines, hooks, crowded ports and labels,
bends and route length. Fit, page area and card share break ties between
drawings that read equally well.
_Avoid_: score, cost, quality metric

**Light**:
What the picture leaves as drawn when a user picks a part out or rests the
pointer on one: the part and everything it contains, every relationship that
touches any of it, the parts at their other ends, and the containers that hold
them. The rest recedes. A relationship is lit along the whole of its route, even
where the picture has another relationship draw a stretch of a lane they share.
The light is attention, like the selection: nothing is written, and a presented
walkthrough step, a selected group or a chosen design question takes its place.
_Avoid_: highlight, focus mode, dim, spotlight

**Trace**:
A user's question of a picked part: how far does it reach? Onward lights
everything the part sends to, directly or through other parts. Back lights
everything that sends to it. Each further relationship hop lights more faintly,
and a part reached by more than one route is as near as its nearest route. A
trace belongs to the part and goes with the pick. Nothing is written, and no
traffic or telemetry is implied: it is a walk along the relationships the board
states.
_Avoid_: impact analysis, blast radius, dependency graph

**Dive**:
How a drill-down looks. The board that a card opens is put inside the card, the
camera flies into the card, and the board grows to the size of the pane. Going
back out runs the flight the other way. At the end of the flight the board
itself takes over from the picture inside the card, in the same place. The dive
is presentation: it happens when the board's picture is to hand in a moment,
and it gives way to the plain opening of the board when it cannot happen.
_Avoid_: zoom transition, page transition, animation

### Commits

**Behind**:
A board is behind its code by the commits that changed a part's bound files
after its last change. Its last change is the last commit that adopted a
variant, or changed a part, relationship, flow or step of the current variant.
Being behind says where to look, not what is wrong. It is derived from Git on
request, never stored, and never a warning (ADR 0045).
_Avoid_: staleness and stale (a server that runs older source), drift (live
infrastructure against its code), lag, freshness, out of date

**Hotspot**:
A part that many commits in a period changed, a year by default. A board's
hotspots are its parts ranked by that count. The count is of commits only, not
of the size or the complexity of the code, and it leaves large commits out
(ADR 0045).
_Avoid_: churn (that counts changed lines), heat, activity, hot path, window
(that is a browser window)

**Change coupling**:
Two parts of one board whose bound declarations or paths change together often
enough to pass code-maat's filters. Its degree is their shared commits over the
mean of their own. A pair that nothing on the board joins asks whether the
board misses a dependency, or whether two parts carry one decision. A
relationship or a flow step joins two parts, and so does one that ends on a
container around either part, or containment itself (ADR 0045).
_Avoid_: temporal coupling (it means three different things in three books),
logical coupling, evolutionary coupling, co-change

**Footprint**:
The parts whose bound declarations or paths a commit range changed, usually a
branch since its merge base, set against the parts that its proposal names:
named and changed, changed but not named, and named but not changed (ADR 0045).
_Avoid_: impact, change set, touched parts, diff (that is a comparison)

**Large commit**:
A commit that changes more than 30 files, code-maat's default limit. Hotspots
and change coupling leave large commits out, because they make unrelated parts
look coupled. Behind and a footprint keep them and say which ones are large
(ADR 0045).
_Avoid_: sweep (the archboard-dev pass after a removal or a rename), bulk
commit, big commit

### Evidence

**Semantics check**:
Reading a vault's boards against the vault's own configuration: the board
families, the vocabulary that the boards use, and the configuration itself. It
reads no code and no Git, and it is the check that canvases poll.
`archboard check semantics` runs it, and so do `archboard check` and
`archboard check all`.
_Avoid_: plain check, board check, vault check, lint

**Embeds check**:
Reading the Embeds of a repository against the boards they draw, in this vault
or in another repository's vault. It says which Embed is outdated or lost its
board, and it can draw each outdated one again. When no checkout on this
machine holds that vault, it fetches the vault of the repository's default
branch.
_Avoid_: artifact check, render check, docs check

**Code check**:
Reading, on request, the code and the infrastructure that the bindings and
anchors of a board name. It reports findings on the current variant or on a
named draft. `archboard check code` runs it, and so do `archboard check` and
`archboard check all`, with the other checks. The Semantics check, which
canvases poll, never does (ADR 0046, ADR 0057).
_Avoid_: lint, scan, drift detection, the check alone (that is `archboard check`,
which runs every check)

**Code facts**:
What one file tells the code check: what it defines, with the visibility of each
definition, what it references, and what it imports. They are derived from the
file on request and never written to a file (ADR 0046).
_Avoid_: index, symbol table, syntax tree, parse result

**Evidence kind**:
What one piece of code or infrastructure proves about two parts: a call, a
configured path, a permission, an import, a build dependency or provisioning.
Each relationship kind can name the evidence kinds that it accepts (ADR 0046).
_Avoid_: relationship kind (that is what the board claims), link type,
dependency type, path alone (that is the file field of a binding)

**Use as a value**:
A use at run time of a name that runs none of its code. It reads a constant,
passes the name on, or tests a value against a class, as `instanceof` and a
catch do. It is call evidence, so it supports a relationship. The code check
never calls a dependency undrawn on it alone (ADR 0046).
_Avoid_: read, weak call, reference (that is any use)

**Candidate**:
Evidence that the code check matched by name only, so the name can stand for
another definition. Two things make evidence resolved instead: a language
server that named its definition, or code that names the file or the address
that it reaches, as an import path does. A finding on a candidate is
information, never a warning (ADR 0046).
_Avoid_: match, hit, guess, possible finding, unresolved evidence

**Finding**:
One thing that the code check reports about one part, relationship or flow
step. It has the shape of a vault diagnostic, with the evidence that it rests
on, and its severity is warning or information (ADR 0046).
_Avoid_: diagnostic (what the Semantics check reports), issue,
violation, drift, problem

**Exposed name**:
A top-level name that the module bound to a container offers to the code
outside it, such as a function that a root file exports. A name that several
places declare counts once. The code check reads the files outside the module
that use it, and the files that pass it on. It counts the names, and it lists
the names with the most users first. This is what the code exposes. The
container's interface is the parts that callers reach on the board, which is a
different thing (ADR 0044, ADR 0046).
_Avoid_: export (the word of one language), public name, API, symbol (that is
the name a binding or an anchor cites), entry point (that is a child on the
board)

### Working

**Tab session**:
The work of one browser tab with Codex: one voice coordinator for the whole
app, and one workhorse for each checkout that the tab works in. The tab keeps the session id in
sessionStorage, and both of its panes name that id to the server. So a reload
keeps the conversation, and a new tab or window starts a new one. A tab that the
browser duplicates shares the session of the original. Each tab session has its
own voice coordinator and voice session, and for each checkout its own thread
link, workhorse, queue and approvals. It also has its own command lease. So two
tabs can talk at the same time. A session ends 60
seconds after the last pane of its tab closes. A reload within that time keeps
the conversation and its approvals. When a session ends, Archboard cancels its
approvals and stops the board news to its workhorses. It unsubscribes each of
its threads once no turn runs on it, and Codex then unloads the thread.
_Avoid_: browser session (that names the realtime handle), session alone, canvas

**Workhorse**:
The Codex thread of a tab session that works in one checkout, for architectural
inspection, analysis, and proposals. It runs in that checkout's directory, so it
reads that repository's own agent instructions and skills. The checkout is the
directory that holds the vault: a checkout root, or the directory that holds an
untracked vault. A tab session has at most one for each checkout, and every
pane of the tab shows the one of the shown conversation. A new chosen checkout
of a repository moves the panes, but not the shown conversation, and every
workhorse stays linked. It can continue its work while the voice
coordinator answers and investigates separately.
_Avoid_: main agent, coding thread, backend agent, worker (that is also an agent
role)

**Thread link**:
The runtime association between one tab session, one checkout and one
controllable Codex workhorse on Archboard's owned app-server child. The first
typed message for that checkout makes it, or the coordinator's first
delegation to it. New conversation links a new workhorse in place of the one in
the shown conversation. The link never lives in the
board or follows the active thread of another client. Child exit and the end of
the tab session clear it, so the next message or Talk makes a new one.
_Avoid_: binding (that means node-to-code here), attachment, selected thread,
active task, task link

**Voice coordinator**:
The fast Codex thread beside the workhorses of a tab session. It serves the
whole app and works in no checkout: it runs in a directory of its own under the
state directory, which holds no vault, so it names the vault with `-C` on every
command. It starts with the first message or Talk
of the tab. A coordinator carries at most one voice
session, so a later voice start replaces it with a fresh one. Realtime voice
attaches to it. It handles conversation and reading boards. It gives
work in a checkout to the workhorse of that checkout, and it starts that
workhorse if there is none. With the voice model it is one assistant: the
voice model speaks, and the coordinator is its subconscious, which reads the
boards, follows its workhorses and decides what the voice model says. With no
voice session it has nothing to do and is never run.
_Avoid_: voice model (that is only one part of the realtime path), voice agent,
router, facilitator, copilot

**Voice model**:
The realtime speech model the user talks to. It listens and speaks, and it hands
off to the voice coordinator for anything that needs a board or work.
_Avoid_: voice coordinator, voice agent, assistant

**Handoff**:
The voice model passing the conversation to the voice coordinator and waiting for
its answer. It carries what the user last said. When the user said nothing, it
carries the voice model's own words, which are never a request from the user.
_Avoid_: delegation (that is the coordinator giving work to the workhorse),
request, callback

**Spoken answer**:
What the voice coordinator gives the voice model to say to the user. It is the
only thing the voice model reacts to. Everything else the coordinator writes
reaches the voice model as quiet context, which it knows but never says.
_Avoid_: final, reply, response

**Steer**:
To add input to a turn that is still running, so that the turn takes it into
account as it continues. Steering never stops the turn. Stopping it is an
interruption.
_Avoid_: interrupt, inject, cancel

**Workhorse stop**:
A request to stop the workhorse of one checkout and its sub-agents, and clear
its pending requests, or to stop every workhorse of a tab session. The workbench
Stop control stops the workhorse of the shown conversation, and a spoken stop
stops every running workhorse of the tab session. Accepting the request does
not prove that its work stopped.
_Avoid_: steer, pause, end voice

**Shown conversation**:
The workhorse conversation that the agent dock of every pane of a tab shows:
the one of the checkout that the user last activated. Focusing a pane, opening
a board, drilling down and picking a workhorse from the dock's list activate a
checkout. Until the first activation it is the checkout of the pane that was
focused when the server first read the tab. Nothing that an agent does to a
pane changes it, so it never changes while somebody types. A typed message, New
conversation, the Stop control and approvals all act on it. A coordinator turn
shows in the conversations of the workhorses that it gave work to, and a turn
that gave none in the conversation that was shown when it started.
_Avoid_: active thread, current conversation, selected thread

**Workhorse news**:
What the voice coordinator is told about the workhorses of its tab session while
voice is live: a turn that ended or waits on the user, and a message a
workhorse sent it. Each piece names the checkout of its workhorse. The
coordinator gets it as it happens, in the turn it is running or in a new one.
It decides what the voice model says and what it only knows.
_Avoid_: callback, notification, outcome report

**Doing**:
The one line an agent says about a board as it writes to it, shown on the
canvas while the write lands. A claim's reason is the campaign an agent has the
board for; a doing is one step of it, and a write that says none is refused.
_Avoid_: description, why, message, comment, log, reason (that is the claim's)

**Proposal**:
A draft variant that states a change nobody has built yet, branched from the
variant it would change.
_Avoid_: plan, design, RFC

**Implementation brief**:
A concise handoff from Archboard to the user's own coding agent, describing
the intended change and how to retrieve its architecture context.
_Avoid_: implementation, proposal, delegation
