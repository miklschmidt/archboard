# The vault is the truth, and the agent-friendly shape is an input format

Canonical authored inputs supersede independent board-file ownership below. The public model reader and durable writer remain the single authority.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Amended by [ADR
0049](0049-one-server-serves-every-vault-and-every-call-names-its-vault.md)
(2026-10-14). The server starts without a vault, because every call names its
vault. A command that finds no vault refuses, so nobody still draws into
nowhere. Everything else stands.

A board persists as a note in the vault. While a board was open, the canvas also
kept its own copy of it. That copy was not always in the same shape as the note.
One board therefore had two shapes, with a conversion between them. Each side
believed its own.

## Why that is a problem

Divergence between two copies of one thing is invisible until it is expensive.
Four bugs came out of this gap. A person found each one by noticing something
absurd, and nothing detected any of them.

The four bugs were:

- A label multiplied every time a board went round the loop. One edge carried
  dozens of copies of its own name and collapsed to no height at all (TASK-024).
- A human renamed a node, and the old name came back (TASK-028).
- A human emptied a label, and the old text returned (TASK-029).
- A label drifted away from the shape it belonged to. It drifted far enough to
  stretch the board's own bounds and skew every layout signal read from them
  (TASK-034).

Each was fixed on its own terms. The gap that produced them stayed. Left open,
it produces the next one.

## Considered and rejected

One option kept the canvas copy authoritative and flushed it to the vault
periodically. This option bounds how much work a crash costs. That is worth
something. It does not remove the second copy or the second shape, so every bug
above remains possible. The decision rejects it because it treats the symptom.

A second option converted on the way out as well as the way in, so agents see
the friendly shape everywhere. That is convenient, and it is a second conversion
in the opposite direction. Two conversions that must agree are what this
decision exists to prevent.

## The decision

The note is the board. The canvas holds no authoritative copy of one.

The note holds Excalidraw's own element format, because that is what a canvas
renders and what Obsidian opens. Anything else needs a conversion before anybody
can look at it. That is where this started.

The agent-friendly shape is an input format and nothing else. It is accepted at
the boundary, converted once on the way in, and never converted on the way out.
An agent that wants something briefer than the elements asks for a description
of the board. A description is a summary rather than a second shape.

There is one implementation of that conversion, shared by everything that needs
it. There is not one implementation per side that must agree.

The write entry is `applyElementInput`. Every server route gives it the input
statements and deletions. The route receives the named elements plus the settled
created, updated and deleted board-shape delta. It owns well-forming, id
minting, label and arrow-ref consumption, binding and routing, text measuring,
version stamps and document repair. Routes still own reading the note,
persisting, broadcasting and answering. TASK-102 can therefore make this entry
one stage of the write door without teaching that door the conversion order.

Session state is not board content, and it is not in question. Examples are
which panes are open, which pane has focus, what a person selected, and which
browsers are connected. None of it can live in a note. All of it dies with the
tab. A reading of this decision that forbids it is unimplementable.

A record of what a board used to be is not in question either. The change feed
keeps the board as it stood at the time that it last told anyone, so that it can
say what changed since. Snapshots keep a state somebody asked to be able to
return to. Both look like copies of a board. Neither is a second claim about the
present one.

A note holds what a board is now and never held what it was, so this is not
duplicated truth. It is the only place that history exists at all. The rule is
about which copy answers the question "what is on this board". That answer is
always the note.

To test the next thing that looks like a copy, ask which question it answers.
Anything that answers "what is on this board" must be the note. A past state
answers "what was on it then". The vault was never asked that question and
cannot answer it. Moving the past state to disk does not remove a second truth.
It invents a second file.

Losing one of these loses history and no work. A diff starts over from now. A
snapshot that somebody meant to go back to is gone. That is a real cost. It is
the cost of a restart, not a contradiction between two copies of the present.
Two more things follow from that test rather than from an exception.

A past state must not be able to become the present one by accident. A history
that shares its element objects with the live board moves together with the
board. Then the diff finds nothing and reports nothing. The failure arrives as
silence. So a record of the past is a copy in full. That is a requirement of
keeping one, not a detail of how it is kept (TASK-042, TASK-048, TASK-052).

Which boards a canvas has open is not board content either. It is the same kind
of fact as which pane has focus. It dies with the process. It is about this
canvas rather than about the board. A note has nowhere to put it. So the process
keeps a board's address and where its note is, and reads the note for everything
else.

## A board with no home in the vault

The canvas can always open before anybody chooses a vault. It starts by showing
a board that has no note behind it. Under this decision that board has nowhere
to be, because the only place where board content can live is a note.

The canvas refuses to start without a vault. There is nowhere to put a board, so
it does not offer one.

The board that the canvas used to open on gets a home in the vault like every
other board. Its home is `<vault>/.archboard/scratch.excalidraw.md`. That path
is in the hidden directory that the stencil library already uses, because it is
archboard's note rather than one that somebody made. Archboard addresses, opens
and saves it exactly like any other board. It is the one board that `board list`
does not offer, for the same reason that Obsidian does not show it.

A canvas that somebody can draw on before discovering that the drawing was never
anywhere is worse than a canvas that will not open yet. It is worse in the way
that costs the most: silently, and only once there is something to lose.

This change to the experience is smaller than it sounds. Choosing a vault is
already an explicit step of installing archboard into a repository. An agent
usually runs that step rather than somebody by hand. On the ordinary path, a
vault is chosen, created and written down before anybody starts a canvas.

Being explicit there keeps the first run good. It is the right place for the
choice. The choice is a decision about where a person's work lives. It is not
something to guess at on their behalf while they are already drawing.

The refusal is therefore a backstop for a canvas started without that step, not
a place to teach what a vault is. It must say that installation chooses one and
how to run it.

One rejected option falls back to somewhere outside the vault. It keeps the
first run soft. It makes a second place where board content lives, which is the
shape this decision exists to remove. It also asks a question with no good
answer. When somebody finally chooses a vault, does that board move, get copied,
or get left behind?

Another rejected option keeps the board in memory as a documented exception.
Everything keeps working, but the rule has a hole in it on the day somebody
writes it. One exception is how a rule stops being a rule. This repository spent
long enough removing invariants that held only while somebody remembered them.

## Consequences

A write returns the resulting board. A canvas renders what the note holds rather
than its own accumulated copy, so divergence cannot build up across a session.
Every write is a resync.

What a canvas sends _up_ is still a delta, and stays that way. A pane can claim
a deletion only for an element that it actually received. This stops a stale or
half-loaded pane from truncating a board that it cannot see all of.

One intent must be one write. Several writes for one gesture race each other
against a single note.

Being the only copy raises the cost of losing it. Writing a note must be atomic,
so a reader sees the old note or the new one and never a partial.

Two writers need to be excluded from each other. ADR 0016 covers this.
