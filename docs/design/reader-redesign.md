# Reader redesign

Status: settled by the council of TASK-559, 2026-10-30. The owner still judges each slice by eye.

This record replaces the reader and navigation parts of
[operator-canvas-shell.md](operator-canvas-shell.md) where the two disagree. Task TASK-559 owns the work.

The owner rejected the reader of PR #19. Transitions were gone, navigation was janky, the right sidebar
overwhelmed the reader, the start was wrong, and drawings held large dead areas. Two seats, Astra and Opus,
each studied the user journey, the drawing and the implementation. Each seat then attacked the other. Their
papers are in [reader-council/](reader-council/). Their measurements came from this repository's model and
from Shop, on the renderer core before commit `4b970e501`. Measure again before a number becomes a gate.

## The rule of the screen

The left column lists where to go. The middle shows it. The right column explains what is selected or open, and
what the marks of the picture mean.

- Left column, 320 px: Find, a repository switcher that shows the pane letter, the destinations `Modules`,
  `Flows`, `Walkthroughs`, `History` and `Measures`, and Talk. `Flows` and `Walkthroughs` list the whole model and
  show its count, so a list here never changes under a reader. Five tabs do not fit the column, so `Measures` starts
  a second row. A proposal read against its base adds `Changes` to that row, with its count and the reader's position.
- Header: crumbs, the open module's code path, the state chip and `Diagram | About`. A flow or a walkthrough
  stands beside the crumbs after a dot, not on them: the crumbs state containment, the open module gives the way
  back, and it does not own what is read.
- Caption, one line: the responsibility of the open module. A flow reading shows its collection's name, then its
  summary, with no label before them. A retained flow with no summary shows the collection alone. The comparison
  control ends the line, and `Clear focus` while a focus stands.
- Picture: the open module with its parts and doors. It fits the room that the right panel leaves.
- Right panel: a permanent column of about 360 px on every Diagram reading (TASK-559.19). The owner chose it because
  a legend behind a button went unnoticed for hours. With nothing selected it shows the open module's name and
  description, and with a selection it shows the subject. The panel is always there, so a selection never refits the
  picture.
- Context: the right panel is where the flows and walkthroughs of what a reader looks at stand (TASK-559.22), under
  the description or the subject's own details. With nothing selected they are those that touch the open module, and
  with a selection those that touch the selected subjects. At the roots with nothing selected the panel lists neither,
  because everything touches the roots and the left column holds it all. A row opens its flow or walkthrough and brings
  the left column to its tab. A list shows four rows, then how many more.
- Interface measures: the reason for this redesign is to find code smells the way A Philosophy of Software Design
  does, so this line matters most. For a module with parts, open or selected, an `Interface` section under its head
  holds one line that counts entries (entry points), hidden parts, callers and pass-through entry points (TASK-559.22,
  ADR 0044). The counts stay apart, because no score combines them, and a pass-through reads like the others, because
  it is a question and not a fault. A count selects what it counts on the module's own picture, opening the module if
  it is not open, so a reader sees the shape: parts as their cards, and callers on the door that holds them. A count of
  none selects nothing. The selection is the only mark, and the picture gains no permanent one. A relationship that ends
  on the module itself names no part, so it makes a caller and no entry point. When a module has such callers, the line
  adds `to module`, their count, as a fact and not a warning. Otherwise a module that callers reach only as a whole
  would read as having nothing to offer. The heading's `Open in About` opens the Interface section of About, which a
  selected module with parts now also has, and which names its hidden parts.
- Measures: the interface line answers for a module that a reader already picked, so `Measures` answers where to
  look across the whole model (TASK-559.29). The list holds every module with its entries, hidden parts, callers,
  `to module` and pass-through entry points, its commits and its unjoined pairs. One sort control orders the list by
  one count, the most first. A tie goes by name, and a module with no such measure comes last, because no count is
  not a count of none. A row selects its module on its picture through the same path as a count in the interface
  line, opening what it must. The interface counts need no server and show at once, and the history counts arrive
  with the read. A module the read skipped says why, a failed read says what happened and offers `Read again`, and a
  model with no bindings says that history needs them. Counts only: no score, no color, no rank and no mark on the
  picture (ADR 0044).
- Trace: with one module selected, the head of `Sends to` holds `Trace onward` and the head of `Receives from` holds
  `Trace back`, each with how many cards it reaches (TASK-559.22). Each further hop lights more faintly, nothing is
  written, and a trace goes with the pick. The walk covers the whole model, because a path can leave through one door
  and return through another. A card stands for all that it holds, and so does the outermost module that holds no
  card, so onward and back are one walk in reverse. A relationship that names the open module as a whole reaches all
  its parts onward. Going back, a part's walk does not cross it, as its lit lines do not.
- Legend: the foot of the right panel, under any action bar, so that a selection never moves it. A group's tag is a
  control, and a bar under the legend put the tag out from under the pointer. It needs no click, and it lists the
  kinds, line types and groups of the reading. A long subject and its lists scroll above it.
- Layout engine: a switch under the legend on a structural reading, because the owner asked for it back (TASK-559.21).
  This browser remembers the choice for every pane. A switch keeps the selection and fits the new picture. The engine
  is part of what a stored drawing is kept under, so one engine never answers for the other. No engine lays out a flow,
  so a flow reading has no switch.
- About: every long list. It names whether it describes the open scope or the selected subject. It covers the panel
  and has no column of its own.

Other long lists and evidence never go into the right panel, because a small right sidebar once overwhelmed the owner.

## What a picture draws

These rules live in the projection, so the CLI, exports and the reader draw the same picture.

1. One module is open. Its children are parts, and the modules that it touches are doors. One edge tab on the
   frame names the open module, and no card stands for it inside the frame. A flow and a deliberate focus keep
   their own extent, because they cross branches.
2. One line joins a pair of drawn parts. A pair with relationships in both directions draws one line with an
   arrow at each end. Distinct comparison states stay separate lines. The owner decided this on 2026-10-30, and it
   replaces the two lines of a reciprocal pair.
3. A line with one kind wears that kind. A line with mixed kinds wears a neutral style, and its tip and panel
   list the kinds. Filters act on the relationships before they join, so hiding a kind never hides another
   kind.
4. A line that holds one relationship wears its label. A joined line wears one combined label that says what the
   relationships are, and it replaces the stacked labels of
   [ADR 0052](../adr/0052-a-board-opens-on-its-overview.md). The first rule that applies gives the words:
   1. If every relationship has the same one label, the line wears that label.
   2. Otherwise, the line names the direct parts of the target card that its relationships reach, for example
      `to Thread tools, Board catalogue +2`. It shows at most two names, then `+N` for the other distinct parts.
      The part that the most relationships reach comes first, then model order. A line that ends on an open frame
      names the parts of that frame.
   3. If no relationship reaches inside the target, the line names the source card the same way, for example
      `from Decode, Worker +1`.
   4. If no relationship reaches inside either card, the line wears its first label and `+N` for the other distinct
      labels.
   5. A line with no labels and no inner parts wears no words.

   A two-way line names the card with more distinct parts and says `with` in place of `to`, or the far card on a
   tie. A line never shows a bare count. Each joined line still lists all of its relationships in its tip and panel,
   each with its real ends.

5. A door is a bright button with a name and no description, in the colour of its group, or of its kind when it
   has no group. Its arrow points up, sideways or down by where its module lies in the tree from the open module.
   A line ends on the part that owns it, whatever else reaches that door. Only a relationship that names the open
   module itself stays on the frame. One click opens a door, and a tip on it lists its real endpoints, grouped by
   child, up to eight of them. About lists them all. With Ctrl, a click selects the door. A comparison can draw a
   door of a module that its state removed, which has nowhere to open, so a click selects it.
   From three lines of one kind to one door, each way, the lines share a trunk, and each line wears its words on its
   own branch, beside the part that owns it. A line that finds no room for its words draws none, and the panel of
   the selected line shows them.
6. Deleted (ADR 0070). This rule took a line off the picture above 18 lines. Every relationship now has a line,
   unless a filter hides its kind or it joins an open module to a part that it holds, which the nesting shows.
   The number stays free, because code and tasks cite the rules by number.
7. A group shows on its cards as a bright tag at the top right, and the cards of a group stand together. No
   frame is drawn round a group. Groups close the legend as the same tags with no switch.
8. A card sets its name, then its responsibility, then its code path at its foot, with the folders dimmed and the
   file bright. A far card shows its name, its path, then the start of its responsibility in the room that its box
   holds, at the one far type scale of its picture. A long path keeps its tail. An unbound container shows its
   shared folder with a count, for example `apps/web/src/ui · 14 paths`, so it reads as a span and not as ownership.
   A path that does not resolve wears the warning mark. An external module shows no path. A card is 260 wide, or
   wider for a long name, unless its note outgrows that width. It then takes the full 340. A group tag never widens
   a card, so a long name wraps sooner. A card with no path centers its words, so it keeps no empty band.
9. `Open code` follows an authored binding only. A derived folder never becomes a source action, and a path
   never establishes identity or containment.
10. A chain of modules with one part each folds, as a code host folds single-child folders. The crumbs show
    each step, and the tree shows one row.
11. Focus draws exactly the focused subjects and their mutual lines. The rest become doors.

## Where a reading lands

A module's picture lands whole, with a ceiling of 1.0, and its far view carries the reading below 0.857. A
sequence or a flowchart fits whole if that scale reaches 0.6. Otherwise it lands at 0.6 on the head of the
frame, because a tall flow is unreadable whole. `0` still fits the whole. Deliberate zoom keeps its full range.

## One surface and one accepted scene

The pane keeps one mounted surface. No key on scope, state or model remounts it. The camera lives above any
reading-dependent branch.

One accepted scene holds the drawing with its model revision, projection, reading and selected identities.
A requested destination stays separate until its matching scene arrives. The crumbs can show the destination
as pending, but inspection, Ask, export and agent context read the accepted scene. A late result never
replaces a newer destination. A pane reports a reading as drawn only after the picture exists.

Each transition that `origin/main` shows for an action returns for the same action, and the rule of
[ADR 0042](../adr/0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md) holds: the reader keeps
orientation and reduced motion is honored. A shared identity alone does not justify a flight. Prefer the
entered or selected subject. If geometry has no real correspondence, change plainly.

## Navigation

- The `Modules` tree opens only the path to the open scope and any branch that the reader opened. The ancestors
  stick to the top while the column scrolls, so the lit row stays in view.
- Siblings sort by code path. Unbound modules come last, and ties use authored order. This amends the sibling
  order of `CONTEXT.md`. A filesystem path never reparents a module.
- The tree follows the focused pane. Another pane keeps its own path in its header.
- Tree, Find and a door navigate. A card selects. A code link opens source. Each has a keyboard route that needs no
  double click or hover. A selected door opens with Enter, and its panel lists its lines. Presenting removes the tree, so Backspace, `[`, `]`, Enter, `F` and `0` cover every move.
- Up and Back are different actions. Moving to another module clears stale subject and flow intent.
- A click lights the card and the tree row, and the right panel names the subject, at once. The picture does not
  move, so a double click lands on the card.
- A flow is chosen first, and the Sequence or Flowchart representation second. Selecting a flow opens the sequence.
  The move from structure to sequence is a plain change. `[` and `]` walk the list of the left column.
- The flow list groups its rows under their collections. A collection name at the end of a row truncated the flow
  names at 320 px. Its heading sticks while the column scrolls, and it is not a row, so it adds no key stop.

## History and proposals

`History` has four sections: `Proposals`, `Current`, `Earlier` and `Shelved`. Proposals stay apart from the rest,
because a draft is future work. Each row leads with its summary, then its name, and a person chooses by those
words, so no row shows an identity. Drafts that share a name differ by the modules they touch. A click carries the
picture to that record, and the panel holds its text.

Each state folds the run of its own checkpoints into one row with a count and the latest time, because the 120
checkpoints of this repository are a record, not a list to read. A checkpoint row offers `Compare`.

A proposal opens against its base. If it has `predecessorCheckpoint`, the base is that checkpoint, because
`against=<predecessor>` refuses the eight imported drafts. A draft then shows 2 to 61 changes, not about 3,000.

One control stands in the caption line, beside the picture, on every reading that can compare. It says what the
picture is compared with, and it is the way out. It offers `No comparison`, `Current`, the draft's own base as
`Its base`, and the other drafts by summary. A draft with no comparison looks like a plain draft: no marks, no
`Changes` tab. A checkpoint is not a choice in the control, because 50 rows that differ by a time and a hash are
no choice. A base that came from `Compare` stands in the control only while it is compared with. `compare: false`
reaches the browser as `againstX=after`, which no person reads.

Review uses a change list in the left column, grouped by owner, because most changes are flow steps that have
no tree row. A proposal opens on it. `N` and `P` walk the list, and visible `Previous` and `Next` controls show
those keys. A change to a step opens that flow's sequence, and a beat opens its presentation. Reparenting shows
old and new parents by name in the row and in the panel. Removed subjects stay reachable, because the drawing of
the comparison holds them. A removed beat or walkthrough has no presentation to open, so the panel names it and
the architecture stays on show.

The walk keeps its place by subject identity. When the list changes, the position changes and the subject stays.
If the subject leaves, the reader stands on the next one that stayed, and `N` shows that subject first. A
selection of a change by any route also moves the place. The list reads the comparison and adds no comparison of
its own.

## Start and states

The browser decides the start once, before any pane exists, because a pane socket names its vault in its first
message (ADR 0049, ADR 0069). The first of these rules that applies decides:

1. An address opens what it names: a repository, a model that a repository holds, or the only listed repository.
2. The last reading of this browser opens, if each of its panes can read the same model in a ready repository.
3. One listed repository with a model opens, because there is nothing to choose.
4. The repository chooser opens, with its field in focus and readable repositories first.

A list position never opens a repository. A repository with no model or a legacy model opens only if somebody asks
for it. The last reading lives in local storage, so it belongs to one browser and one server. A second pane opens
the repository of the pane beside it, or the destination that the reader chose.

Each repository state has one line and one way on:

| State                          | The pane or page says     | The way on                                                                   |
| ------------------------------ | ------------------------- | ---------------------------------------------------------------------------- |
| No repository                  | `No repository yet`       | The command `archboard install-skill`, and a row appears in about 2 s        |
| Repository not on this machine | `<name> is not here`      | The chooser and `archboard repo add`                                         |
| No choice                      | `No repository open`      | The chooser                                                                  |
| No model                       | `No model yet`            | `Ask the agent to write it` fills the composer                               |
| Planning model                 | `Nothing implemented yet` | `Open <proposal>`, or `Ask the agent to propose a design` fills the composer |
| Legacy model                   | `Migration required`      | `Ask the agent for a migration preview` fills the composer                   |

The reader sends what an action puts in the composer. No state writes to the model by itself.

A failed draw keeps the last picture, names the failure and
offers Retry and Back. A healthy refresh shows nothing. A lost server overlays the picture and does not move
it. A removed module says that it was removed, and offers its retained reading. A filtered empty result offers
`Show whole scope`. A loading message appears only after a delay, and names the destination.

Warnings sit on the one subject that they concern. The model-wide count moves to About.

## Authoring

`archboard check` warns on a pass-through container, on a root with no relationship and on a relationship between
a module and a part that it holds, and the consumer skill teaches the same rule. These are warnings. A count or a folder spread is a signal and never proves that a
container has no job, so no write is refused.

`CONTAINER_PASS_THROUGH` names a module with parts and no binding, which no relationship or flow names, and whose
parts no relationship or flow joins. One part is the plain case. The rule reads no count and no folder, and it
needs no escape: `Workhorses` has 17 relationships between its parts and never warns. It flags all 8 layers of the
model before they left, and 8 other containers of 130. A model that binds no code is exempt, because an unbound
container then says nothing. `ROOT_UNCONNECTED` names a root with no relationship to another root. A relationship
of a part inside it counts, and a lone root is exempt. `CONTAINER_LINE_TO_OWN_PART` names a relationship between a
module and a part that it holds, at any depth. The nesting already shows it, so a reading that opens the module draws no
line for it, and the panel and About still list it. `RELATIONSHIP_ON_CONTAINER`, at information level in the code
check, names a relationship with an end on a module with parts. That end makes a caller and no entry point there, and it
stays acceptable when no part stands for the call.

A flow must say what it does, because only 1 of this repository's 72 flows did, and a reader could not tell that
`One author run` belongs to the skill evaluation. Every flow has a summary, and this rule is an error, not a
signal. It binds a write and current content, and it stops at history:

- A write that creates or changes a flow and leaves it with no summary refuses. `add-flow` requires the field in
  the type of the request, no edit clears it, and the candidate refuses any other change with
  `FLOW_SUMMARY_REQUIRED`. A write that leaves the flow alone proceeds, so an author can repair a model in steps.
- `archboard check` reports each current flow with no summary as `FLOW_SUMMARY_MISSING` and exits 1. A reader can
  still read that model.
- A flow file, a retained checkpoint, a migration preview, a signed record and a journal keep decoding a flow
  with no summary, because a reading written before this rule must open exactly.

## Rejected

| Idea                                                               | Reason                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| A hard limit of 18 lines                                           | It hides the many weak lines that make a foundation a foundation, and leaves six packages of `Workspace packages` with no line. |
| Keep the strongest one to three neighbors                          | The rule leaves a picture with 3,113 crossings against 560, and it hides meaning by frequency.                                  |
| One line for each relationship family                              | It keeps 47 lines at the root against 29.                                                                                       |
| Majority kind on a joined line                                     | It is a false mark: 8 of 29 root lines mix kinds.                                                                               |
| A Read menu, or a history panel                                    | A menu closes on each choice and hides three nouns. A panel adds a surface type. The column rule covers both.                   |
| A contextual outline in place of the tree                          | A median of 4 rows leaves the column empty and does not read like a repository.                                                 |
| An authored orientation reading                                    | It adds one more thing to author. A repaired Focus and the tour give the same value.                                            |
| Saved readings, `Copy link`, picture export, "since you were here" | No observed need. The address holds a reading.                                                                                  |
| A write refusal for empty containers                               | The owner asked for guidance and detection.                                                                                     |
| A code path as a link on the card                                  | The picture has no such target, and the row is under 9 px high in 43 of 123 readings.                                           |
| Removing a stored label reservation first                          | Inside these rules, labels cost 10 percent overall. Revisit the root after the content rules.                                   |
| A list of labels on a joined line                                  | The median line holds 3 labels of 32 characters, so stacked labels leave 80 of 123 readings at fit 0.6.                         |
| A line budget that drops a line when a longer path joins its ends  | A path through a third part does not state what the dropped line states, so the caption's claim was false (ADR 0070).           |
| A line on the frame when several parts reach a door                | It reads as the container acting, and it hides which part acts. On `Commands`, 16 of 24 parts showed no line (ADR 0070).        |

## Gates

Each gate is absolute and uses the real pane of this design, about 1239 by 1003 beside the right panel.

1. At least 108 of 123 readings of this repository pass at fit 0.6. The rest land whole on their far view. The
   corpus now holds 115 readings, and 106 of them pass on the merged reader.
2. At landing, a name reaches 12 px and a path reaches 9 px on every reading of at most 18 lines.
3. Every relationship has a line, as rule 6 says, and the panel lists every connection.
4. Each reading of Shop stays at or below its size today.
5. A draft opens against its base and draws with no error.
6. The grading corpus includes `Workspace packages`, the root, `Browser`, `board` and `Command startup`.

The kill test comes first. The owner opens `Browser` and `Workspace packages` after the content rules land. If
doors or the reduced chain do not read better than today, stop before any interface work. The fallback is an
inside-only reading, with a connection reading on request.

## Order of work

The subtasks of TASK-559 carry this order. Each slice removes the path that it replaces.

1. Model data: name, `Architecture inputs`, 29 stale paths and pass-through containers.
2. Content rules and landing. This is the fastest test of the design.
3. One surface, one accepted scene, and the transitions.
4. Honest failures and the proposal base.
5. Left column and header.
6. Right panel, About and the legend.
7. Start and return.
8. Review of a proposal.
9. Local compaction and candidates ranked by fit, on the content that the rules leave.

Two side tracks run beside these: the server cost of reads and watchers, and the `check` warnings with the skill
text.
