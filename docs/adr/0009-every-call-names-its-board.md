---
status: superseded by ADR-0020
---

# Every call names its board, and there is no active board

Superseded by [ADR 0020](0020-board-work-never-depends-on-a-browser-session.md).
ADR 0020 retains explicit board naming and replaces the display and rendering
model recorded here.

A pane is a slot holding its own canvas, and a canvas holds one board
(CONTEXT.md). Two panes therefore hold two boards. That is the entire reason
panes exist: current beside proposed, on one wall, while somebody talks about
the difference.

Until this decision the server held one _active_ board. Every caller that said
nothing about boards got that one: `add`, `describe`, `clear`, `promote`,
`board save`, most of the REST interface, and every CLI command. When two panes
can hold two boards, "the board" is a phrase with no referent for all of them.

So a caller names its board, every time, and the server refuses a call that
names none. `activeBoardKey()`, `activeBoard()` and `setActiveBoard()` are gone
from the store. There is nothing left to fall back to, so nothing can fall back.

## Why not one of the easier answers

Three easier answers were rejected:

- An active board separate from what the panes show. Panes become views, and
  unqualified calls keep targeting one stable board. This is the least
  disruptive answer, and it is wrong in the way that costs most. The agent can
  write to a board nobody is looking at, and neither the human nor the agent
  learns of it. Every symptom appears later, somewhere else.
- The focused pane decides. This reads beautifully for voice: "add a cache"
  lands where the human is looking. It also means that a human clicking on the
  other pane moves the write target of an agent halfway through a task. That is
  a race with a person in it, and the person cannot see that they are in it.
- Refuse only once the panes disagree. This is tempting, because it breaks
  callers only in the situation that did not previously exist. But it makes
  correctness depend on browser state. The same script works alone, and it
  corrupts a board after somebody splits the screen behind it. A rule that holds
  only while nobody touches the glass is not a rule.

Each of those is the same mistake in a different costume: a write resolving
against ambient state that the caller cannot see and did not set. Exactly that
mistake bit us one level down just before this decision, where code bindings
resolved against the process's working directory. An environment variable, a
remembered last-opened board or a per-shell default each reintroduces it here.

The cost of the decision we took is a flag on every call. An agent that
generates those calls does not mind, and a human gets a refusal that tells them
what to type. In exchange, no write can land on a board the caller did not name.
This is not because the resolution is clever, but because there is no
resolution.

## The two axes

Boards and panes are addressed separately, and only one of them is strict. The
board axis is authority, and it is always explicit: `--board <key>` on the
command line and `?board=` on the API.

The pane axis is display. If one pane is on screen, `board open X` goes into
that pane. If two panes are on screen, it needs `--pane left|right|1|primary…`.
If no pane is on screen, the board is loaded and nothing shows it. Every answer
names the pane the board landed in.

Putting a board on the wrong half of the screen is visible and instantly
correctable. Writing into the wrong board is silent. So the display axis gets a
default where it cannot be wrong, and the authority axis gets none at all.

Operations addressed to the browser rather than to a board take no board:
`screenshot`, viewport control and the `panes` report. The pane they run in
already settles which board they concern. `mermaid` is the exception that proves
it. Conversion happens in the pane that answers for the browser. So `mermaid`
names a board _and_ the server refuses it unless that is the board the pane
holds.

## Scratch

The canvas still boots holding a `scratch` board. So a first-time user has
something in front of them rather than an empty shell and a refusal. It is a
board like any other, and a caller must name it like any other:
`--board scratch`. It gets a home in the vault the same way anything else does:
`board save --board scratch --as <name>`.

A refusal lists the boards that are open, and scratch is one of them. So the
message that says "you must name a board" also says which boards there are.

## Consequences

- Every board-touching REST route and CLI command changed. There was nobody to
  keep compatible: archboard is private and unpublished.
- `board current` became `board info <name>`. "The current board" was the
  question the deleted pointer answered.
- `board list` no longer reports `active`. It reports `onScreen`, which is what
  each pane is holding.
- `/health` and `/api/sync/status` count boards instead of naming one.
- A new pane shows whatever another pane is already showing, or `scratch`. It
  never adopts "the last board opened", because adopting it is the pointer
  again, reintroduced as a display default and available to drift.
- The server sends `board_switched` to one socket. Broadcasting it was the same
  statement as "every pane shows the same board", since the message replaces the
  receiving pane's entire scene.
