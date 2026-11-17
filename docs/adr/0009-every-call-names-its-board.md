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
names none. There is nothing left to fall back to, so nothing can fall back.

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
