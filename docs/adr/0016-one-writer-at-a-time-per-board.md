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

**Which leaves who renews, and the obvious answer does not work** (TASK-080).
An agent driving this by voice is not something that sits there between two
commands. It exists for the length of each one, and nothing of it survives in
between, so there is nothing to send a heartbeat and no way to tell an agent
reading code for two minutes from one that died after the first. An agent asked
to renew would lose the board whenever it stopped to think, which is the moment
it is most obviously still working.

So the canvas renews on the agent's behalf, and a claim is bounded by the three
things that can actually be observed: the length the agent asked for, capped,
which is the only bound on an agent that walked away; the lease, which frees the
board within seconds of the *canvas* dying, that being the process a lock file
can be orphaned by; and the person, at any moment.

**A person can always take it back.** The lock excludes writers from each other.
It does not lock somebody out of their own wall, and no agent may make a
75-inch display stop responding to the person standing at it. The agent is told
it has lost the board, and it stops rather than fighting for it.

**Taking it back is one deliberate act, and not any touch at all** (TASK-080).
Two things argue against the first version of this decision. A board held by
somebody else can still be panned and zoomed, so a person watching an agent
restructure a board is reading it, and reading it must not end it. And nothing
the agent has already written is put back by taking the board, so a hand resting
on a wall display would leave a board half way through a restructure with nobody
having decided anything. The board says who has it and what they said they were
doing, and beside that, the way to take it.

**Revoking is not undoing.** Every write an agent has already made is already
in the note, because that is what ADR 0015 means. So a revoked claim leaves a
board part way through whatever the agent was doing, and nothing rolls that
back. A claim is therefore not a transaction, and an agent holding one cannot
treat the board as private until it is finished: it has to leave the board
sensible after each write, or do the work on a variant and swap when it is
done. The skill teaches that alongside when to claim, because an agent that
believes it has exclusive use until it says otherwise will eventually be wrong
in the middle of a restructure.

**What happens to the work already in flight, then** (TASK-080). Three answers
were open and this is the one taken.

A write that has started finishes. Stopping it half way is the torn note that
every write being one whole note exists to prevent, and it would be a strange
way to answer "somebody wants their board back" — the write takes about as long
as the tap did.

Nothing already written is put back. An undo would have to be an inverse of
whatever the agent was doing, expressed as a further write, at the moment
somebody has taken the board in order to write it themselves. It would be a
third writer, arriving unasked, and it would throw away work that may well be
what the person wanted to keep. What actually gets somebody back to where they
were is the vault's own history, which is a note in a directory and is what
version control is for.

And the agent is told once. Once, because it must not be able to keep the
board by asking again, and must not be locked out of a board it may perfectly
well be asked to work on next. So the next thing it does — a write, or a fresh
claim — is refused, and says that the board is part way through whatever it was
doing and that nothing was undone. What it does after that is ordinary. Saying
what state it left the board in is the agent's job, and the skill's to teach.

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

**The broadcast reaches one canvas, and exclusion reaches all of them**
(TASK-067). Taking or releasing a board is news the canvas that did it can
send; a second canvas serving the same vault has nothing to tell it, because
the lock is a file and a file does not call anybody. So a pane on that second
canvas is excluded correctly and learns about it at the write rather than
before the touch, which is the yank this section exists to prevent, surviving
in the one configuration nobody has yet run.

Closing it means polling the lock files of the boards on screen, roughly once
per renewal interval. That was left undone deliberately: it is a timer per
canvas paid at all times against a case that costs milliseconds when it does
happen. A long claim changes that arithmetic, because the pane would be wrong
for minutes rather than for one write, so TASK-080 is where the poll earns
itself, and where it was built.

**And it is paid for by a canvas somebody is looking at, and by no other**
(TASK-080). A pane exists while something renders it, so a canvas with no
browser attached has nobody to be wrong and reads nothing. That is what settles
the objection rather than the claim alone: the cost is not a timer per canvas at
all times, it is a few file reads a second for as long as a screen is up.

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
