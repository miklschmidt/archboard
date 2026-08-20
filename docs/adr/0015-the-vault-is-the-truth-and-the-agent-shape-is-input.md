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

## A board with no home in the vault

The canvas has always been able to open before anybody has chosen a vault, and
it starts by showing a board that has no note behind it. Under this decision
that board has nowhere to be, because the only place board content may live is
a note.

Three answers are defensible and they are not the same product: give that board
a home in a default location, make choosing a vault a precondition of drawing
anything, or keep it as an explicitly unpersisted scratchpad whose contents are
understood to be lost. This ADR does not pick one. It records that the question
exists and is owned, because a decision that says "everything is a note" while
one board silently is not would be the same class of gap it was written to
close.

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
