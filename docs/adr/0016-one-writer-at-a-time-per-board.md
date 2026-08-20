# One writer at a time, per board

A board is a note, and two writers to one note lose each other's work. An agent
drawing while a person rearranges is not rare on a wall display: it is the
normal way this tool is used.

## Why ordering is not enough

The obvious answer is to order the writes so none is lost. That produces a
board nobody asked for. An agent redrawing a subsystem and a person dragging a
box are not two edits to be interleaved, they are two people editing the same
thing at once, and a tidy merge of them is a blend neither intended.

Exclusion says what is actually true: one of you is editing this board.

## The decision

A board has a mutex. An agent takes it to write. A person takes it by touching
the canvas. Nobody else writes while it is held.

**The lock lives beside the note, not inside whichever process happens to be
running.** The note is the truth (ADR 0015), and more than one canvas may be
serving one vault. A lock held in a process does not exist to any other, so it
would not be a lock. What cannot be held in memory cannot have its guard held
there either.

**It is a lease, not a flag.** A holder that dies mid-write would leave a bare
flag set forever, and a board nobody can write until somebody finds and deletes
a file they have never heard of. So the lock records who holds it and until
when, and expires on its own. The first crash costs one lease, not the board.

**A person's hold is a gesture, not a session.** Holding the lock for as long
as a board is on screen would block every agent for as long as anybody is
looking at the wall. It is taken when they start changing something and
released once that change has been written and the canvas has gone quiet.

Because the expected wait is therefore short, an agent **waits** rather than
failing. When it waits longer than it is willing to, it says who holds the
board and since when, so a voice session has something to say instead of going
silent.

## An agent may claim a board for longer than one write

The per-write lock fits most of what an agent does. It does not fit an agent
that knows it is about to redraw a board or restructure a subsystem. Taking and
releasing a lock twenty times leaves nineteen gaps for somebody else to write
into, and the board is never in one consistent state while it is being built.

So an agent may claim a board, and say roughly how long it expects to need it.
The skill teaches the judgement: claim when the work is substantial and you know
that in advance, do not claim to move one box.

**A long claim is not a long unattended hold.** The claim expires, and a working
holder renews it. Stop renewing and it lapses in moments. The expiry bounds how
long a working agent may keep a board; the renewal bounds how long a dead one
does. A long expiry with no renewal would mean one crash costs the board for as
long as the claim was for.

**A person can always take it back.** The lock excludes writers from each other.
It does not lock somebody out of their own wall, and no agent may make a
75-inch display stop responding to the person standing at it. A touch revokes
the claim, the agent is told it has lost it, and it stops rather than fighting
for it.

## The lock is a broadcast, not only a guard

A canvas applies a change the instant a finger moves. Refusing that change when
it is finally written would take the board away from somebody mid-gesture,
which is the divergence between what is drawn and what is true that ADR 0015
exists to end, arriving from the other direction.

So a pane whose board is held elsewhere stops accepting changes **before** the
touch, not after the write. That makes lock state something every pane holding
the board is told about, rather than only a gate at the point of writing. A
pane that has lost contact and cannot be told must assume the board is held
rather than that it is free.

For a write that takes a moment, showing the board as unavailable is enough.
For a claim that may run for minutes, a person needs to know that an agent has
the board and roughly what it is doing, or the wall has simply stopped working
for no reason they can see.

## Consequences

**The window that coalesces a person's changes now has a second job.** It also
decides how long an agent waits for them. Shortening it releases the board
sooner and writes to the vault more often; lengthening it does the reverse.
Those pull against each other, so the values that govern flushing, settling,
leases and waiting belong together in one place with the tension written beside
them, rather than scattered where each can be tuned in ignorance of the other.

**The mutex is one concept with a small interface**: ask to write a board, and
either write it or learn who holds it. Acquiring, renewing, expiring a dead
holder, telling the panes, and waiting all sit behind that. A lock where every
caller assembles the same steps itself is a lock whose callers drift apart.

**Obsidian does not respect any of this.** Nor does a sync client or a text
editor. Those are the writers ADR 0006's refusal to overwrite a note that
changed underneath was built for, and it stays. The mutex handles our own
concurrency; that check catches everybody else's.
