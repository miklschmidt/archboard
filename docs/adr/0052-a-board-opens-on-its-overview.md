---
status: accepted
---

# A board opens on its overview, and relationships and calls are drawn apart

Recursive module scope supersedes the board overview and named-view navigation below. Direct context and aggregated relationship inspection retain their semantic rules.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Amended by the owner on 2026-10-24 (TASK-513, TASK-514). A line that joins
several relationships stacks their labels, one chip for each distinct label in
board order, as a lone label stands on one, with the ground between two chips.
A relationship with no label adds none. It keeps the id, the
order and the kind of the decision below, and it has no description, emphasis,
traffic or anchor, because each of those is a fact about one of the
relationships. The tip over the line and the inspector name its drawn ends and
every relationship that it joins, each with its own ends. An agent is told that
the person picked every one of them. On Device Trust Library a line of five
calls had no label, and its tip and inspector named only its first call. A
count label ("5 relationships") was tried first and told a reader too little.
Everything else stands.

Decided with the owner on 2026-10-15. This decision supersedes one clause of
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md):
"Do not add size-driven refusal, automatic partitioning, or a density policy
before an observed problem requires one". The problem is now observed.

## Context

A board opened on its whole variant: every part and every relationship in one
drawing. On 2026-10-15 the whole drawing of 12 of the 17 dogfood boards had more
than 40 lines. Live panes had 25 cards and 71 lines, and the owner called it
incomprehensible. The same drawings took the longest to lay out. With the
`blocks` engine, Browser application took 40 s, and four other boards took
5 to 14 s. No layout engine makes 71 lines in one drawing readable.

Two facts of the vault made those drawings:

- Every dogfood board was flat. Every part sat directly in the one container
  that the board describes. So no reading was able to close a container and
  show less.
- Most relationships were calls. Live panes had 47 relationships of kind
  `call`, beside 9 dependencies, 9 events, 5 HTTP requests and 1 data line. A
  call is one exchange between two parts. A sequence view already draws calls
  from a flow, so the architecture drawing repeated them as lines.

## Decision

A board has two readings that nobody authors, beside the views that agents
author:

- The overview. It is what a board opens on, and what a render with no view
  draws. It shows the board's root parts. Every container is drawn closed, as
  a card. A
  relationship to a hidden part is drawn to the closed card that holds it. All
  relationships from one drawn part to another become one line. A line that
  joins several relationships has no label (amended above). Its kind is the kind that most of
  them have, and the first one in board order breaks a tie. A relationship
  between two parts inside one closed card is not drawn. A relationship
  between a container and a part that it holds is not drawn either, because
  the nesting already shows it. The overview draws no flows.
- Everything. It shows every part and every relationship, as the whole variant
  did before. A reader asks for it as the view named `Everything`. The view
  list in the browser offers it last and dimmed, after the authored views: it
  is the reading a person reaches for least.

No authored view can be named `Overview` or `Everything`. A write that names one
is refused.

A walkthrough step that names no view is told through what the pane shows, as
before. If the overview hides a subject of the step, the step says so, as it
does for any reading that hides one. Agents give every step a view, as
`WALKTHROUGH_VIEW_MISSING` already asks.

A board's overview has a budget. If the overview of the current variant draws
more than 15 parts or more than 25 lines, `archboard check` warns with
`OVERVIEW_CROWDED`. The fix is structure, which agents author: containers that
gather the parts of the subject into a few areas, and views that open each
area. A container needs a responsibility that the code supports, as every part
does. It is never a box for layout. If the code has a folder for the area, the
container binds to it. If the code keeps the area's files beside others in one
folder, the container has no binding. Moving files to give a picture a box is
not worth the change to every binding and import.

A view that opens a container still draws a relationship between the
container and a part inside it. The line runs from the box into itself. A reader
cannot tell what that line means. `archboard check` warns with
`CONTAINER_LINE_TO_OWN_PART` on each such relationship of the current variant.
A call inside a container starts at the part that makes it.

The board is the container of its subject. On 2026-10-16 the owner found
the Agent workbench board drawn as one giant box in every reading. Fourteen
dogfood boards held a root part that stood for the board itself, with every
other part inside it. The overview first drew the root parts and the parts one
level inside them, and it needed that outer part. Now no part stands for the
board, and the overview draws the root parts with every container closed. A
view still draws the containers of the parts it shows, because a card drawn
outside its container says something untrue. A container that holds every
part the view asked for is the exception: it separates nothing in the
picture, so the view leaves it out.

Relationships and calls are drawn apart:

- A relationship says that one part needs or uses another. One relationship
  between two parts is enough. Its kind says how the parts work together.
- A call is one exchange in an order. It belongs to a flow, and a sequence view
  draws it.

The archboard skill teaches both rules. Kinds are vocabulary that each vault
defines, so no check can tell a call from a relationship. The budget is the
check that catches a board that drew its calls as relationships.

## Consequences

- The overview of a flat board is the same drawing as Everything. Every flat
  board over the budget reads `OVERVIEW_CROWDED` until an agent gives it
  structure. TASK-482.03 pilots the change on Live panes, and the other boards
  follow board by board.
- A render with no view, from the CLI, the HTTP route or the browser, draws the
  overview. An agent that wants every part passes `--view Everything`.
- When the pane shows the overview, an agent's board context still reads the
  whole variant. The agent authors the whole board, so it needs all of it.
- The overview's numbers are constants in one place, beside what they hold
  against. A change to them is a change to this decision.
- The grammar now called `data-flow` draws a sequence diagram. TASK-350 renames
  it to `sequence`, and it adds a flowchart grammar for the logic of a flow.
