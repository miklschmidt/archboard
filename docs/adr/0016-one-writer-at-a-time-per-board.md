# One writer at a time, per board

Subject, state, and structure claims supersede per-board ownership below. A short vault lease serializes installation and recovery.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

[ADR 0022](0022-the-note-decides-and-a-persons-edit-is-optimistic.md) supersedes
this decision in part. A content gesture no longer revokes a claim. A claimed
board is read-only to users until an explicit release. An agent is not asked to
restructure in view of the user. The lock, the lease and the broadcast stand.

A board is a note, and two writers to one note lose each other's work. An agent
that draws while a user rearranges is not rare on a wall display. It is the
normal way to use this tool.

## Why ordering is not enough

The obvious answer is to order the writes so that none is lost. That produces a
board that nobody asked for. An agent that redraws a subsystem and a user who
drags a node are not two edits to interleave. They are two people who edit the
same thing at once. A tidy merge of them is a blend that neither intended.

Exclusion says what is actually true. One of you is editing this board.

## The decision

A board has a mutex. An agent takes it to write. A user takes it by touching the
canvas. Nobody else writes while somebody holds it.

The lock lives beside the note, not inside whichever process happens to be
running. The note is the truth (ADR 0015). More than one canvas can serve one
vault. A lock that a process holds does not exist to any other process, so it is
not a lock. What memory cannot hold cannot have its guard in memory either.

The lock is a lease, not a flag. A holder that dies mid-write leaves a bare flag
set forever. The board then stays unwritable until somebody finds and deletes a
file that they do not know about. So the lock records who holds it and until
when. It expires on its own. The first crash costs one lease, not the board.

A user's hold is a gesture, not a session. Holding the lock for as long as a
board is on screen blocks every agent for as long as anybody looks at the wall.
When the user starts to change something, the hold starts. It ends once the
change is written and the canvas goes quiet.

The expected wait is therefore short, so an agent waits and does not fail. When
it waits longer than it is willing to, it says who holds the board and since
when. A voice session then has something to say and does not go silent.

## An agent can claim a board for longer than one write

The per-write lock fits most of what an agent does. It does not fit an agent
that knows it is about to redraw a board or restructure a subsystem. Taking and
releasing a lock twenty times leaves nineteen gaps for somebody else to write
into. The board is never in one consistent state while an agent builds it.

So an agent can claim a board and say roughly how long it expects to need it.
The skill teaches the judgment. If the work is substantial and you know that in
advance, claim the board. Do not claim a board to move one node.

A long claim is not a long unattended hold. The claim expires, and a working
holder renews it. If the holder stops renewing, the claim lapses in moments. The
expiry bounds how long a working agent can keep a board. The renewal bounds how
long a dead agent keeps it. A long expiry with no renewal means that one crash
costs the board for as long as the claim was for.

That leaves the question of who renews, and the obvious answer does not work
(TASK-080). An agent that drives this by voice does not sit there between two
commands. It exists for the length of each command, and nothing of it survives
in between. So nothing can send a heartbeat. There is also no way to tell an
agent that reads code for two minutes from one that died after the first. An
agent that has to renew loses the board whenever it stops to think. That is the
moment it is most obviously still working.

So the canvas renews on the agent's behalf. Three observable things bound a
claim:

- The length that the agent asked for, capped. This is the only bound on an
  agent that walked away.
- The lease, which frees the board within seconds of the _canvas_ dying. The
  canvas is the process that can orphan a lock file.
- The user, at any moment.

A user can always take it back. The lock excludes writers from each other. It
does not lock somebody out of their own wall. No agent is allowed to make a
canvas stop responding to the user who stands at it. The agent is told that it
lost the board, and it stops. It does not fight for the board.

Taking a board back is one deliberate content act, and not any touch at all
(TASK-080, TASK-118). Two things argue against the first version of this
decision. A board that somebody else holds can still be panned and zoomed. So a
user who watches an agent restructure a board is reading it, and reading it must
not end it.

When somebody takes the board, nothing that the agent already wrote is put back.
A hand that rests on a wall display leaves a board half way through a
restructure. Nobody decided anything. The board says who has it and what they
said they were doing. Beside that, it shows the explicit way to take it.

TASK-118 also makes a real content change a takeover act. A user who drags,
resizes, types, creates or deletes content revokes the claim through the same
hold route. Pan, zoom, selection, focus and pointer contact without a content
delta do not.

Revoking is not undoing. Every write that an agent already made is in the note,
because that is what ADR 0015 means. So a revoked claim leaves a board part way
through whatever the agent was doing, and nothing rolls that back. A claim is
therefore not a transaction. An agent that holds one cannot treat the board as
private until the agent finishes. It must leave the board sensible after each
write.

Working on a variant and swapping it in at the end was written here as a second
option. It was an error to write it. Exclusion is about who is allowed to write.
It was never a license to work out of sight. A creator needs an immediate
connection to what they are making. On this canvas, the creator is both of you.

An agent that hides a restructure until it is finished breaks that connection
for the user who watches. The swap also discards whatever the user drew
meanwhile.

Nor was there a problem that needed that remedy. The claim above stops an
interruption that nobody saw coming from catching an agent half-way through. The
user is told that a board is held and why. Taking it back is therefore something
that the user chooses with the work in front of the user.

An agent owes it to somebody who watches the board to leave it sensible between
writes. It is not insurance against a surprise. An agent that believes it has
exclusive use until it says otherwise will eventually be wrong in the middle of
a restructure. For that reason, the skill teaches this together with the choice
to claim.

What happens to the work already in flight (TASK-080)? The paragraph above is
clear about the agent and says nothing about the half-drawn board that it leaves
behind. There were three possible actions about that. This is what the design
does about each.

A write that started finishes. Stopping it half way creates the torn note. The
rule that every write is one whole note exists to prevent that torn note. It is
also a strange way to answer "somebody wants their board back". The write takes
about as long as the tap did.

Nothing already written is put back. An undo must be an inverse of whatever the
agent was doing. That inverse is a further write. It lands at the moment
somebody takes the board to write it themselves. It is a third writer that
arrives unasked. It also throws away work that is perhaps what the user wanted
to keep. The vault's own history gets somebody back to where they were. That
history is a note in a directory, and that is what version control is for.

The agent is told once. It is told once for two reasons. It must not be able to
keep the board by asking again. It must not be locked out of a board that
somebody can perfectly well ask it to work on next. So the next thing it does, a
write or a fresh claim, is refused. The refusal says that the board is part way
through whatever the agent was doing and that nothing was undone. What the agent
does after that is ordinary. It is the agent's job to say what state it left the
board in, and the skill teaches that.

## The lock is a broadcast, not only a guard

A canvas applies a change the instant a finger moves. Refusing that change at
its final write takes the board away from somebody mid-gesture. This is the
divergence between what is drawn and what is true that ADR 0015 exists to end,
and it arrives from the other direction.

So exclusion governs persistence. It does not govern whether the local canvas of
a connected user responds. Excalidraw applies a content change immediately. The
pane takes the human hold single-flight. The existing vault-backed mutex waits
out any write that already started before it persists the human report.

The local edit remains visible and pending throughout. Nothing reloads it away
because acquisition was delayed or failed. Agent writes remain pessimistic and
do not answer before persistence.

The lock still broadcasts its state so that a pane can explain who has the board
and why. It also broadcasts its state so that content can deliberately revoke a
claim while camera and selection do not. A pane that lost contact and cannot
receive that state still fails closed and enters view mode.

For a write that takes a moment, it is enough to show the board as unavailable.
For a claim that can run for minutes, a user needs to know that an agent has the
board and roughly what it is doing. Otherwise the wall stops working for no
reason that the user can see.

The broadcast reaches one canvas, and exclusion reaches all of them (TASK-067).
The canvas that takes or releases a board can send that news. A second canvas
that serves the same vault has nothing to tell it. The reason is that the lock
is a file, and a file does not call anybody. So a pane on that second canvas is
excluded correctly. It learns about the exclusion at the write rather than
before the touch. This is the yank that this section exists to prevent, and it
survives in the one configuration that nobody runs yet.

Closing that gap means polling the lock files of the boards on screen, roughly
once per renewal interval. We left that undone deliberately. The timer runs at
all times on every canvas. The case that it covers costs milliseconds each time
it happens. A long claim changes that arithmetic, because the pane is wrong for
minutes rather than for one write. So TASK-080 is where the poll pays for
itself, and where we built it.

A canvas that somebody looks at pays for the poll, and no other canvas does
(TASK-080). A pane exists while something renders it. So a canvas with no
browser attached has nobody to be wrong and reads nothing. That settles the
objection, rather than the claim alone. The cost is not a timer per canvas at
all times. It is a few file reads a second for as long as a screen is up.

## The claim says why an agent has the board. Each write says what it is doing

The banner that a claim puts up answers "why has the wall stopped". Only a claim
puts one up. The banner says nothing about the twenty writes underneath it.

Most writes are not under a claim at all. An agent that moves one node takes the
board for twenty milliseconds and says nothing. A user who watches the node move
sees no stated reason. That breaks the connection between a creator and what
they create, for the one of the two creators who stands there.

So an agent says what it is doing on every write, in one line, and the canvas
shows it as the write lands (TASK-095). The doing is required, because the agent
must write the sentence, and that is the mechanism. A field that an agent can
leave out is a field that it leaves out. A write with no doing is refused rather
than defaulted, because a canvas that invents "an agent wrote something" is
worse than silence.

The claim and the doing are one story at two scales. The claim's reason is the
campaign, and each line is a step. Neither stands in for the other. Reading the
reason back on every write is an agent repeating itself. A claim without steps
says what is being attempted and never how far it is.

The doing is not board content. It is what somebody said while changing
something, not a fact about the board. So it never reaches the note, and it dies
with the canvas. ADR 0015 already draws that carve-out for panes, sockets and
what a user selected.

The board reports what it _became_ separately, by diffing. That is a different
question with a different answer. A move that changes nothing nameable still had
an intent. A line that turns out to be wrong is still what was said.

A user says nothing. The user's change report is the user's own act. The write
boundary can tell one from the other because a pane names itself. Making
somebody narrate their own drawing on their own wall is absurd.

## Consequences

The two reporting deadlines have different jobs. A non-restarting progress
deadline periodically persists continuous work. A longer trailing idle deadline
writes the final dirty state after the gesture settles. One report can be in
flight and one latest delivery can be queued. The leading hold and its renewal
span both.

Shortening either deadline writes the vault more often. Lengthening either
deadline extends how long an agent can wait. The values that govern progress,
idle, settling, leases and waiting therefore live together in
`packages/timing/src/shared/constants/timing.ts`.

The mutex is one concept with a small interface. A caller asks to write a board,
and then either writes it or learns who holds it. Acquiring, renewing, expiring
a dead holder, telling the panes, and waiting all sit behind that interface. A
lock where every caller assembles the same steps itself is a lock whose callers
drift apart.

Obsidian does not respect any of this. Neither does a sync client or a text
editor. ADR 0006's refusal to overwrite a note that changed underneath was built
for those writers, and the refusal stays. The mutex handles our own concurrency.
That check catches everybody else's.
