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
The process on one port that keeps the boards, serves the panes in the browser
and runs Codex for the agents. `archboard start` starts it, and every other
command talks to it.
_Avoid_: canvas server, canvas (that is the surface), host, backend

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
session.
_Avoid_: screenshot, pane export

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
The mean rate at which illustrated traffic shots are fired along a connection,
expressed in shots per second; the moments between them vary.
_Avoid_: dot count, traffic speed

**Traffic speed**:
The authored pace of illustrated traffic along a connection, in diagram units per
second. A shot flies a fixed multiple of it, so a higher speed is a faster line.
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
sideways from a card.
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
(`--discard`). Nothing else deletes a board.
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

**Pane news**:
Where a user's reading of a pane stands after they changed it by hand: the board,
variant or view they are now looking at, what they now have selected, or the pane
they moved to. It is told to the voice model as one sentence of names, saying
only what changed. A change an agent or the canvas caused is never pane news.
_Avoid_: callback, telemetry, event, selection report

**Outside change**:
A board change made by an agent that is neither the workhorse nor the voice
coordinator of this tab session. The workhorse of another tab is such an agent.
The voice model and the coordinator are both told. Neither asked for the
change, and what they know of the board is no longer true.
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
The cross-repository collection in which every board is persisted.
_Avoid_: library, workspace, store, repository, folder

### Reading

**Reading direction**:
The way a view's architecture reads across the page: always from the top down.
It is a property of the rendered variant, never of its authored content.
_Avoid_: orientation, rotation, layout direction, landscape, portrait

**Reference pane**:
The board area of the desktop shell at its one supported size, with the
navigator and the inspector open and the fit margin taken off every side. What
a drawing is measured against.
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
them. The rest recedes. The light is attention, like the selection: nothing is
written, and a presented walkthrough step or a selected group takes its place.
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

### Working

**Tab session**:
The conversation of one browser tab with Codex. The tab keeps the session id in
sessionStorage, and both of its panes name that id to the server. So a reload
keeps the conversation, and a new tab or window starts a new one. A tab that the
browser duplicates shares the session of the original. Each tab session has its
own thread link, workhorse, voice coordinator and voice session. It also has
its own queue, command lease and approvals. So two tabs can talk at the same
time. A session ends 60
seconds after the last pane of its tab closes. A reload within that time keeps
the conversation and its approvals. When a session ends, Archboard cancels its
approvals and stops the board news to its workhorse. It unsubscribes each of
its threads once no turn runs on it, and Codex then unloads the thread.
_Avoid_: browser session (that names the realtime handle), session alone, canvas

**Workhorse**:
The primary Codex thread of a tab session, for sustained code, repository and
multi-step work. It can go on working while the voice coordinator answers and
investigates separately.
_Avoid_: main agent, coding thread, backend agent, worker (that is also an agent
role)

**Thread link**:
The runtime association between one tab session and one controllable Codex
workhorse on Archboard's owned app-server child. The first message or Talk of
the tab makes it, and the focused pane of the tab speaks through it. New
conversation links a new workhorse in its place. The link never lives in the
board or follows the active thread of another client. Child exit and the end of
the tab session clear it, so the next message or Talk makes a new one.
_Avoid_: binding (that means node-to-code here), attachment, selected thread,
active task, task link

**Voice coordinator**:
The fast Codex thread beside the workhorse of a tab session. It starts with the
first message or Talk of the tab. A coordinator carries at most one voice
session, so a later voice start replaces it with a fresh one. Realtime voice
attaches to it. It handles conversation and bounded direct work, and it gives
sustained work to the workhorse. With the voice model it is one assistant: the
voice model speaks, and the coordinator is its subconscious, which reads the
boards, follows the workhorse and decides what the voice model says. With no
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

**Workhorse news**:
What the voice coordinator is told about the workhorse of its tab session while
voice is live: a
turn that ended or waits on the user, and a message the workhorse sent it. The
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
