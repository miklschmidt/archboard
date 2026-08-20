# A node records a level only to differ from its board

`promote --variant` stopped being something the caller repeats: TASK-040 made a
node take the variant of the board named on the call. `promote --level` has the
same shape, the board knows a level and the caller types it again, and it does
**not** get the same treatment.

A node records a level only when it differs from its board. Omitting `--level`
leaves the node with none, and a node with none is at its board's level.

## Why not the same as variant

The two look alike and are not. A variant is a property of the board, and a
node on `payments@option-a` cannot sensibly belong to `current`, so a default
from the board is the only correct value and a wrong stamp is always a bug.

A level is a property of a board (`CONTEXT.md`), and a node may legitimately sit
at a different one: a board at `system` can hold a node recorded at `service`
because the board describing that node's internals exists. That is a
drill-down, and it is the case worth writing down.

The code already assumed this. `describe` shows a node's level only when the
nodes on a board carry **more than one** distinct level (`showLevel`), because
a level every node shares says nothing that the board's own level does not.
Defaulting from the board would stamp every node identically, `showLevel` would
never fire again, and the one signal the field carries would be gone.

So the answer is not "default it" and not "drop it". It is that an absent level
means "same as the board", which costs no storage and cannot go stale.

## Considered and rejected

Dropping level from a node. Tempting, since nothing requires it and a board
carries one. Rejected because `describe` reads it and a mixed-level board is a
real thing to want to say.

Defaulting from the board and keeping `--level` as an override, the TASK-040
shape. Rejected on the `showLevel` argument above: it is duplication that
destroys a signal, not duplication that removes a footgun.

## Consequences

Nothing stamps level, so nothing has to keep it in step with the board. A
reader that wants a node's effective level resolves it as the node's own, or
the board's when the node has none. Every reader today either prints it when
present or compares it, and both stay correct without change.
