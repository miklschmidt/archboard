---
status: accepted
---

# Every call names its board; there is no active board

A pane is a slot holding its own canvas, and a canvas holds one board
(CONTEXT.md). Two panes therefore hold two boards, which is the entire reason
panes exist: current beside proposed, on one wall, while somebody talks about
the difference.

Until this decision the server held one _active_ board, and every caller that
said nothing about boards got that one — `add`, `describe`, `clear`, `promote`,
`board save`, most of the REST interface, and every CLI command. The
moment two panes can hold two boards, "the board" is a phrase with no referent
for all of them.

**So a caller names its board, every time, and a call that names none is
refused.** `activeBoardKey()`, `activeBoard()` and `setActiveBoard()` are gone
from the store; there is nothing left to fall back to, so nothing can fall back.

## Why not one of the easier answers

**An active board separate from what the panes show.** Panes become views;
unqualified calls keep targeting one stable board. Least disruptive, and wrong
in the way that costs most: the agent can be writing to a board nobody is
looking at, and neither the human nor the agent is told. Every symptom appears
later, somewhere else.

**The focused pane decides.** Reads beautifully for voice — "add a cache" lands
where the human is looking. It also means an agent halfway through a task has
its write target moved by a human clicking on the other pane. That is a race
with a person in it, and the person cannot see they are in it.

**Refuse only once the panes disagree.** Tempting, because it breaks callers
only in the situation that did not previously exist. But it makes correctness
depend on browser state: the same script works alone and corrupts a board when
somebody splits the screen behind it. A rule that holds only while nobody
touches the glass is not a rule.

Each of those is the same mistake in a different costume — a write resolving
against ambient state the caller cannot see and did not set. We had just been
bitten by exactly that one level down, where code bindings resolved against the
process's working directory. An environment variable, a remembered last-opened
board, or a per-shell default would all reintroduce it here.

The cost of the decision we took is a flag on every call. An agent generating
those calls does not mind, and a human gets a refusal that tells them what to
type. In exchange, **no write can land on a board the caller did not name** —
not because the resolution is clever, but because there is no resolution.

## The two axes

Boards and panes are addressed separately, and only one of them is strict.

- **Board — authority.** Always explicit. `--board <key>` on the command line
  and `?board=` on the API.
- **Pane — display.** `board open X` with one pane on screen goes into that
  pane; with two it needs `--pane left|right|1|primary…`; with none the board is
  loaded and nothing shows it. Every answer names the pane the board landed in.

Putting a board on the wrong half of the screen is visible and instantly
correctable. Writing into the wrong board is silent. That is why the display
axis is allowed a default where it cannot be wrong, and the authority axis is
not allowed one at all.

Operations addressed to the browser rather than to a board — `screenshot`,
viewport control, the `panes` report — take no board, because the pane they run
in already settles which board they concern. `mermaid` is the exception that
proves it: conversion happens in the pane that answers for the browser, so it
names a board _and_ is refused when that is not the board the pane holds.

## Scratch

The canvas still boots holding a `scratch` board, so a first-time user has
something in front of them rather than an empty shell and a refusal. It is a
board like any other and has to be named like any other — `--board scratch` —
and it gets a home in the vault the same way anything else does,
`board save --board scratch --as <name>`.

A refusal lists the boards that are open, and scratch is one of them, so the
message that says "you must name a board" also says which boards there are.

## Consequences

- Every board-touching REST route and CLI command changed. There was
  nobody to keep compatible: archboard is private and unpublished.
- `board current` became `board info <name>`. "The current board" was the
  question the deleted pointer answered.
- `board list` no longer reports `active`; it reports `onScreen`, which is what
  each pane is holding.
- `/health` and `/api/sync/status` count boards instead of naming one.
- A new pane shows whatever another pane is already showing, or `scratch`. It
  never adopts "the last board opened", because that would be the pointer again,
  reintroduced as a display default and available to drift.
- `board_switched` is sent to one socket. Broadcasting it was the same statement
  as "every pane shows the same board", since the message replaces the receiving
  pane's entire scene.
