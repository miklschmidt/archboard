# A node records a level only to differ from its board

Recursive canonical containment supersedes the level contract below. No numeric depth replaces board levels.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

`promote --variant` stopped being something the caller repeats. TASK-040 made a
node take the variant of the board named on the call. `promote --level` has the
same shape: the board knows a level, and the caller types it again. It does not
get the same treatment.

A node records a level only where it differs from the level of its board.
Omitting `--level` leaves the node with none. A node with none is at the level
of its board.

## Why not the same as variant

The two look alike, but they are different. A variant is a property of the
board. A node on `payments@option-a` cannot sensibly belong to `current`, so the
default from the board is the only correct value. A wrong stamp is always a bug.

A level is a property of a board (`CONTEXT.md`), and a node can legitimately sit
at a different level. A board at `system` can hold a node recorded at `service`,
because the board that describes the internals of that node exists. That is a
drill-down, and it is the case worth writing down.

The code already assumed this. `describe` shows the level of a node only where
the nodes on a board carry more than one distinct level (`showLevel`). A level
that every node shares says nothing that the level of the board does not say. If
the board supplies the default, every node gets an identical stamp and
`showLevel` never fires again. The one signal that the field carries is gone.

So the answer is not "default it" and not "drop it". It is that an absent level
means "same as the board". This costs no storage and cannot go stale.

## Considered and rejected

One option is to drop the level from a node. This is tempting, because nothing
requires it and a board carries one. The decision rejects it because `describe`
reads the level and a mixed-level board is a real thing to want to say.

Another option is to default the level from the board and keep `--level` as an
override, the shape of TASK-040. The decision rejects it on the `showLevel`
argument above. This duplication destroys a signal and removes no footgun.

## Consequences

Nothing stamps a level, so nothing has to keep it in step with the board. If a
reader wants the effective level of a node, it resolves the level as the node's
own. If the node has none, the reader uses the level of the board. Every reader
today either prints the level of a node that has one, or compares it. Both stay
correct without change.
