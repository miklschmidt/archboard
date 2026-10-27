---
status: accepted
---

# A person can move a board to another repository

Canonical models retire the live board-move operation below. Cross-model ownership transfer is unavailable. Portable export and import preserve complete model evidence.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Decided with the owner on 2026-10-14, together with ADR 0049 and ADR 0050. The
migration is planned in the Backlog document doc-002, "One Archboard server for
every vault".

Once one app reads every repository (ADR 0050), a board sometimes lives in the
wrong one. For example, a board that a meta project drew belongs to the product
repository that it describes. The owner wants a person to move it in the
browser. `archboard semantic move <board> --to <dir>` is the same operation on
the command line, and agents can use it too.

## Decision

The move is the second exception to "agents author, users read". The first is
taking back a claim. Like a take-back, a move that a person starts in the
browser is the person's own act, so it writes no doing line (ADR 0016). The CLI
form is an agent write like any other, and it needs `--doing`.

The target is a repository identity or an untracked vault. A board moves into
the vault of the chosen checkout of its target identity. On the command line,
`--to` names a directory, and the vault is found from it as `-C` finds one.

The whole note moves, with every variant, every former name and every subject
id unchanged. Thus the comparison and the history stay true. A move is not a
rename. The board keeps its name, and its former names keep answering in the
target vault (ADR 0036).

A drill-down is rewritten wherever the move changes what it means, so that it
names a repository identity as ADR 0049 requires. A drill-down in the source
vault that opened the moved board then names the target identity. A drill-down
on the moved board that opened a board of the source vault then names the
source identity.

These moves are refused:

- A move between two checkouts of one identity. They are two copies of one
  vault, and git carries boards between them.
- A move while somebody else claims the board in the source vault, or its name
  in the target vault. The move takes the lease in both vaults.
- A move to a vault that already has a board, or a former name, with the same
  name.
- A move that needs a drill-down into an untracked vault. An untracked vault
  has no identity, so no board in another vault can name it.

Before a person moves a board, the browser shows the drill-downs that the move
rewrites. After the move, the pane that showed the board shows it in its new
repository.

## Order, not one write

One thing that somebody asked for is one write (TASK-068). A move cannot be one
write, because two vaults are two files, often in two repositories. So the move
writes in a fixed order. It writes the target note first. Then it rewrites the
drill-downs in the source vault, and then it deletes the source note. A move
that stops part way leaves the board in both vaults, never in neither. The same
move, run again, finishes it.

Each repository commits its own half of the move.

## Considered options

One option keeps a forwarding record in the source vault, as a former name keeps
a renamed board answering. Drill-downs from other vaults, branches or machines
then still open the moved board. But they are rare, `archboard check` names each
one as an unknown target, and a forwarding record is a new kind of file in a
vault. So no record is kept.

A move that only agents can run keeps "the browser writes nothing to a board"
without an exception. The owner chose the exception, because moving a board is
a person's decision about where the work lives, and it needs no agent.

## Consequences

- ADR 0022 and ADR 0023 are amended. The browser writes to a board in two
  cases: a take-back and a move.
- Drill-downs from other vaults into a moved board become unknown targets.
  `archboard check` in those vaults reports them.
