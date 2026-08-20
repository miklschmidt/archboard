# One writer at a time, per board

A board is a file, and two writers to one file lose each other's work. So a
board has a mutex. An agent takes it to write; a human takes it by touching the
canvas; nobody else may write while it is held.

A queue was the alternative and it is worse. Ordering writes makes an agent's
redraw interleave cleanly with a human's drag and calls the result consistent,
when in fact nobody asked for the blend. Exclusion says only one of you is
editing this board, which is what is actually true.

## The lock lives beside the note, not in a process

This follows from ADR 0015. If the note is the truth, two canvas servers on
different ports over one vault can both write it, and a mutex inside one
process does not exist to the other. The lock is a file in the vault next to
the note, or an advisory lock on the note itself.

The same rule as the document: what cannot be held in memory cannot have its
guard held there either.

## A lease, not a flag

An agent that dies mid-write, or a tab that is closed mid-gesture, would leave
a bare flag set forever and the board unwritable until somebody found and
deleted a file they had never heard of.

So the lock records who holds it and until when, and expires on its own. A
holder that is still working renews. The first crash costs one lease, not the
board.

## The human's hold is a gesture, not a session

Holding the lock for as long as a board is open would block every agent for as
long as somebody is looking at the wall. Instead:

- The first change of a gesture takes it, which needs a message the browser
  does not send today. `REPORT_DEBOUNCE_MS` is a *trailing* debounce with no
  maximum wait, so a continuous drag posts nothing until 400 ms after the
  finger lifts. Claiming the lock is therefore its own immediate message at the
  first change, not a side effect of the report.
- The report debounce fires, the write lands, and nothing new arrives.
- It releases.

So the hold is one gesture plus about 400 ms, and an agent's expected wait is
under a second.

**An agent therefore waits rather than failing.** Failing fast would be wrong
almost every time it happened. It blocks up to a cap, and when the cap is hit
it says who holds the board and since when, which also gives a voice session
something to say instead of going quiet.

## An agent may claim a board for longer than one write

The per-write lock is the default and it fits most of what an agent does. It
does not fit an agent that knows it is about to redraw a board, restructure a
subsystem, or work through twenty elements. Taking and releasing a lock twenty
times leaves nineteen gaps for somebody else to write into, and produces a
board that was never in one consistent state while it was being built.

So an agent can claim a board and say how long it expects to need it. The skill
teaches the judgement: claim when the work is substantial and you know it in
advance, do not claim to move one box.

**A long claim is not a long unattended hold.** The claim has a time to live,
of perhaps an hour, and the holder renews it while it is working. Stop renewing
and it expires in seconds. The time to live bounds how long a working agent may
keep the board; the renewal interval bounds how long a *dead* agent keeps it. A
flat hour with no renewal would mean one crash costs an hour, which is the
whole board gone for anybody else.

**A human can always take it back.** The lock excludes writers from each other.
It does not lock a person out of their own wall, and an agent that has claimed
a board for an hour must not be able to grey out a 75-inch display somebody is
standing in front of. A human's touch revokes the claim, the agent is told, and
it stops rather than fighting for it. An agent that has lost its claim finishes
nothing further and says so.

**The pane says who holds it and why.** For a two-hundred millisecond write,
disabled is enough. For a claim that may run for minutes, a person needs to
know an agent is restructuring the board and roughly what it is doing, or the
wall has simply stopped working for no reason they can see.

## The lock is a broadcast, not only a guard

Excalidraw applies a drag locally the instant a finger moves. If an agent holds
the lock and a human starts dragging, refusing the write at flush time would
yank the board out from under them, which is the client-side divergence ADR
0015 exists to stop, wearing a different hat.

So lock state is pushed to every pane holding the board, and a pane whose board
is locked by somebody else disables interaction **before** the touch. The human
sees that the board is not theirs to edit this second, rather than finding out
afterwards.

**A pane with a dropped socket must not believe the board is free.** Lock state
arrives over the socket, but reporting changes is deliberately not gated on the
socket being up, so a pane that has quietly lost its connection would keep
accepting a human's edits against a board somebody else holds. Whatever carries
the claim has to fail closed.

## Timing constants live in one module

The 400 ms report debounce now has two jobs: coalescing writes to the vault,
and bounding how long an agent waits for a human. Those pull in opposite
directions. Shortening it releases the lock sooner and writes more often, and
under ADR 0015 every write costs an fsync.

Anyone tuning it for one job will silently degrade the other, so the constants
that govern flushing, lock leases, wait caps and settling live together in one
module that the frontend, the server and the CLI all import, with the tension
written down beside them. They are scattered across `useCanvasSession.ts` and
`change-feed.ts` today, and the two halves of a relationship cannot be read in
one place.

## The mutex is a deep module

One concept, one small interface, everything else behind it: acquiring,
renewing, expiring a dead holder, the file beside the note, the broadcast to
panes, the wait cap. A caller asks to write a board and either writes it or is
told who has it.

Nothing outside reaches past that interface to the lock file or the broadcast.
A shallow lock, where every caller assembles the same four steps, is how the
steps drift apart.

## Obsidian does not respect any of this

A lock file stops archboard processes. It does not stop the Excalidraw plugin,
a sync client, or a text editor. Those are exactly the writers ADR 0006's hash
check was built for, and it stays: the lock handles our own concurrency, the
hash catches everybody else's.
