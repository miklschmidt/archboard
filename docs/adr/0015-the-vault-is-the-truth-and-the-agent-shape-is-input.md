# The vault is the truth, and the agent-friendly shape is an input format

A board is persisted as a note in the vault. While a board was open, the canvas
also kept its own copy of it, and that copy was not always in the same shape as
the note. One board therefore had two shapes, with a conversion between them,
and each side believed its own.

## Why that is a problem

Divergence between two copies of one thing is invisible until it is expensive.
Four bugs came out of this gap, each found by a person noticing something
absurd rather than by anything detecting it.

A label multiplied every time a board went round the loop, until one edge
carried dozens of copies of its own name and collapsed to no height at all
(TASK-024). A human renamed a node and the old name came back (TASK-028).
A human emptied a label and the old text returned (TASK-029). A label drifted
away from the shape it belonged to, far enough to stretch the board's own
bounds and skew every layout signal read from them (TASK-034).

Each was fixed on its own terms. The gap that produced them stayed, and would
have produced the next one.

## Considered and rejected

**Keep the canvas copy authoritative and flush it to the vault periodically.**
Bounds how much work a crash costs, which is worth something. It does not
remove the second copy or the second shape, so every bug above remains
possible. Rejected because it treats the symptom.

**Convert on the way out as well as the way in, so agents see the friendly
shape everywhere.** Convenient, and it is a second conversion in the opposite
direction. Two conversions that must agree is the thing this decision exists to
prevent.

## The decision

The note is the board. The canvas holds no authoritative copy of one.

The note holds Excalidraw's own element format, because that is what a canvas
renders and what Obsidian opens. Anything else would need converting before it
could be looked at, which is where this started.

The agent-friendly shape is an input format and nothing else. It is accepted at
the boundary, converted once on the way in, and never converted on the way out.
An agent that wants something briefer than the elements asks for a description
of the board, which is a summary rather than a second shape.

There is one implementation of that conversion, shared by everything that needs
it, rather than one per side that are meant to agree.

The write entry is `applyElementInput`. Every server route gives it the input
statements and deletions, and receives the named elements plus the settled
created, updated and deleted board-shape delta. It owns well-forming, id
minting, label and arrow-ref consumption, binding and routing, text measuring,
version stamps and document repair. Routes still own reading the note,
persisting, broadcasting and answering. TASK-102 can therefore make this entry
one stage of the write door without teaching that door the conversion order.

**Session state is not board content and is not in question.** Which panes are
open, which has focus, what a person has selected, which browsers are
connected: none of it can live in a note, all of it dies with the tab, and a
reading of this decision that forbade it would be unimplementable.

**Nor is a record of what a board used to be.** The change feed keeps the board
as it stood when it last told anyone, so that it can say what changed since.
Snapshots keep a state somebody asked to be able to return to. Both look like
copies of a board and neither is a second claim about the present one. A note
holds what a board is now and has never held what it was, so this is not
duplicated truth, it is the only place that history exists at all. The rule is
about which copy answers the question "what is on this board", and that answer
is always the note.

The test, for the next thing that looks like a copy: ask which question it
answers. Anything that answers "what is on this board" must be the note. A past
state answers "what was on it then", which the vault has never been asked and
cannot answer, so moving it to disk would not remove a second truth, it would
invent a second file. Losing one of these loses history and no work: a diff
starts over from now, a snapshot somebody meant to go back to is gone. That is
a real cost and it is the cost of a restart, not a contradiction between two
copies of the present.

Two more things follow from that test rather than from an exception.

**A past state must not be able to become the present one by accident.** A
history that shares its element objects with the live board moves when the board
moves, and then the diff finds nothing and reports nothing, which is the failure
arriving as silence. So a record of the past is a copy in full, and that is a
requirement of keeping one rather than a detail of how it is kept (TASK-042,
TASK-048, TASK-052).

**Which boards a canvas has open is not board content either.** It is the same
kind of fact as which pane has focus: it dies with the process, it is about this
canvas rather than about the board, and a note has nowhere to put it. So the
process keeps a board's address and where its note is, and reads the note for
everything else.

## A board with no home in the vault

The canvas has always been able to open before anybody has chosen a vault, and
it starts by showing a board that has no note behind it. Under this decision
that board has nowhere to be, because the only place board content may live is
a note.

**The canvas refuses to start without a vault.** There is nowhere to put a
board, so it does not offer one. The board it used to open on gets a home in
the vault like every other board: `<vault>/.archboard/scratch.excalidraw.md`,
in the hidden directory the stencil library already uses, because it is
archboard's note rather than one somebody made. It is addressed, opened and
saved exactly like any other board, and it is the one board `board list` does
not offer, for the same reason Obsidian does not show it.

A canvas somebody can draw on before discovering the drawing was never anywhere
is worse than a canvas that will not open yet, and it is worse in the way that
costs the most: silently, and only once there is something to lose.

This is a smaller change to the experience than it sounds, because choosing a
vault is already an explicit step of installing archboard into a repository,
and that step is usually run by an agent rather than by hand. On the ordinary
path a vault has been chosen, created and written down before anybody starts a
canvas. Being explicit there is what keeps the first run good, and it is the
right place for the choice: it is a decision about where a person's work lives,
not something to guess at on their behalf when they are already drawing.

The refusal is therefore a backstop for a canvas started without that step, not
a place to teach what a vault is. It should say that installation chooses one
and how to run it.

**Rejected: fall back to somewhere outside the vault.** It keeps the first run
soft, and it makes a second place where board content lives, which is the shape
this decision exists to remove. It also asks a question with no good answer:
when a vault is finally chosen, does that board move, get copied, or get left
behind.

**Rejected: keep it in memory as a documented exception.** Everything keeps
working and the rule has a hole in it on the day it is written. One exception
is how a rule stops being a rule, and this repository has spent long enough
removing invariants that held only while somebody remembered them.

## Consequences

**A write returns the resulting board.** A canvas renders what the note holds
rather than its own accumulated copy, so divergence cannot build up across a
session: every write is a resync.

What a canvas sends *up* is still a delta, and stays that way. A pane may only
claim a deletion for an element it has actually received, which is what stops a
stale or half-loaded pane truncating a board it cannot see all of.

**One intent must be one write.** Several writes for one gesture would race
each other against a single note.

**Being the only copy raises the cost of losing it.** Writing a note has to be
atomic, so a reader sees the old note or the new one and never a partial.

**Two writers need excluding from each other.** That is ADR 0016.
