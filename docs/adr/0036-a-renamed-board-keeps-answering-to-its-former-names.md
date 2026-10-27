---
status: accepted
---

# A renamed board keeps answering to its former names

Canonical stable identities and explicit migration aliases supersede live board rename operations below. Exact original addresses retain their original historical coverage.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Extends [ADR 0010](0010-board-names-are-case-insensitive.md) and
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md).
Tracked as TASK-281.

Boards get renamed. This repository's own vault has a board called
`Canvas server` for a process that is now called the Archboard server. A node on
`Archboard` drills down to it by that name. A user's vault has boards and
variants with names like slugs (`platform-public-api`, `public-api-independent`)
that want readable names.

Nothing was able to change a name. A name is how everything outside a board
reaches it. A drill-down on another board names a board and a variant. A pane
address in somebody's browser history names them. So do commands and sentences
that people wrote down elsewhere.

## Decision

A rename is one write to one board, through the same boundary as every other
write, and it changes nothing but the name. It uses the same lease and the same
expected version. It makes one version advance and one atomic write (ADR 0016).
Every id, every variant with its lifecycle and ancestry, and every record of
adoption, shelving and reconciliation stay exactly as they were. A rename is
never a delete and a recreate, and never an adoption.

The old name is kept on the board as a former name, and every name a board ever
had keeps opening it. A board read, a write, a claim, a pane address and the
links of the navigator resolve a name the same way. They look for the board
whose file carries the name. If no file does, they look for the board that
carried the name before a rename.

The same holds for a variant inside its board. So no other board has to change
for its links to stay true, and a rename cannot land half way across the vault.

A board's own name always wins over another board's former name, so a name
resolves to one board whatever the vault holds. A name that a board used to have
is not free. Renaming or creating another board with that name is refused,
because the old name still opens the first board wherever something names it. A
board can be given back a name that it had, and that takes the name off its
former names.

A board file is named after the board. The read boundary refuses a file that
holds a board by another name (ADR 0010). So the write that renames a board
moves its file. The write moves the file first and then writes it. A crash
between the two leaves one file that every reader refuses, with the words that
say how to put it back. It never leaves two coherent boards, one of which is
stale.

The write also takes the lease of the new name, without waiting. So a rename
never races a board that is being created under the name that the rename wants.

A change of case alone is a rename of the spelling, not of the board (ADR 0010).
Its key is unchanged, so every address still names it and nothing is kept as a
former name. Variant names are always matched exactly, so for a variant a change
of case is a change of name like any other.

A request for the name that something already has is refused. A write advances
the version and tells every pane that the board changed, although nothing
changed.

## Considered and rejected

One alternative is to rewrite every reference in the same write. A rename then
takes the lease of every board that links to the renamed one. It rewrites their
drill-downs, as one write across the vault. Separate boards are independent
documents (ADR 0023), and the vault has no transaction that spans files. So "all
or nothing" is a new mechanism that nobody else needs.

That rewrite also changes frozen history. A historical variant's drill-down is a
record of what it said. The rewrite still leaves pane addresses, browser history
and every sentence outside the vault with a name that no longer answers. The
former name answers all of those with one field.

Another alternative is to leave the old name dangling and report it. The vault
checker names every broken drill-down, and an agent repairs each one. That makes
a rename a campaign across boards, with a window in which links open nothing. It
never repairs a saved address.

## Consequences

- A name that no board carries costs a read of the vault to find the board that
  used to carry it. Only a miss pays that cost. Reading a board by its own name
  costs what it always did, and nothing caches the answer (ADR 0015).
- Everything this process keyed by the old name follows the board. Panes that
  show it are pointed at the new name, and their address is rewritten to it. The
  claim of the server on it is carried over for what is left of the campaign.
  What agents said they were doing stays with it. A second server on the same
  vault still reaches the board through the old name, and its panes follow on
  their next open.
- The fields are additive, so the contract version did not move. This build
  reads every document that was written before them. Moving the version will
  rewrite every board of every vault on its first read.
