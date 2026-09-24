---
status: accepted
---

# A renamed board keeps answering to its former names

Extends [ADR 0010](0010-board-names-are-case-insensitive.md) and
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md).
Tracked as TASK-281.

Boards get renamed. This repository's own vault has a board called
`Canvas server` for a process now called the Archboard server, and a node on
`Archboard` drills down to it by that name; a user's vault has boards and
variants named like slugs (`platform-public-api`, `public-api-independent`)
that want readable names. Nothing could change a name, and a name is how
everything outside a board reaches it: a drill-down on another board names a
board and a variant, a pane address in somebody's browser history names them,
and so do commands and sentences written down elsewhere.

## Decision

**A rename is one write to one board, through the same boundary as every other
write, and changes nothing but the name.** The same lease, the same expected
version, one version advance and one atomic write (ADR 0016). Every id, every
variant with its lifecycle and ancestry, and every record of adoption, shelving
and reconciliation stay exactly as they were. It is never a delete and a
recreate, and never an adoption.

**The old name is kept on the board as a former name, and every name a board
ever had keeps opening it.** A board read, a write, a claim, a pane address and
the navigator's links all resolve a name the same way: the board whose file
carries the name, else the board that carried it before a rename. The same holds
for a variant inside its board. So no other board has to change for its links
to stay true, and a rename cannot land half way across the vault.

**A board's own name always wins over another board's former name**, so a name
resolves to one board whatever the vault holds. And a name a board used to have
is not free: renaming or creating another board with it is refused, because
the old name still opens the first board wherever something names it. A board
may be given back a name it had, which takes that name off its former names.

**The board's file follows its name.** A board file is named after the board and
the read boundary refuses a file holding a board by another name (ADR 0010), so
the write that renames a board moves its file: moved first and then written, so
a crash between the two leaves one file every reader refuses with the words that
say how to put it back, never two coherent boards one of which is stale. The new
name's lease is taken as well, without waiting, so a rename never races a board
being created under the name it wants.

**A change of case alone is a rename of the spelling, not of the board** (ADR
0010): its key is unchanged, so every address still names it and nothing is kept
as a former name. A variant's name has always been matched exactly, so for a
variant a change of case is a change of name like any other. A request for the
name something already has is refused, because a write advances the version and
tells every pane the board changed when nothing did.

## Considered and rejected

**Rewrite every reference in the same write.** A rename would take the lease of
every board that links to the renamed one and rewrite their drill-downs, as one
write across the vault. Separate boards are independent documents (ADR 0023)
and the vault has no transaction spanning files, so "all or nothing" would be a
new mechanism nobody else needs. It also rewrites frozen history — a historical
variant's drill-down is a record of what it said — and it still leaves pane
addresses, browser history and every sentence outside the vault naming a board
that no longer answers. The former name answers all of those with one field.

**Leave the old name dangling and report it.** The vault checker would name every
broken drill-down and an agent would repair each one. That makes a rename a
campaign across boards with a window in which links open nothing, and it never
repairs a saved address.

## Consequences

- A name that no board carries costs a read of the vault to find the board that
  used to carry it. Only a miss pays it; reading a board by its own name costs
  what it always did, and nothing caches the answer (ADR 0015).
- Everything this process keyed by the old name follows the board: panes showing
  it are pointed at the new name and their address is rewritten to it, the
  canvas's claim on it is carried over for what is left of the campaign, and
  what agents said they were doing stays with it. A second canvas on the same
  vault still reaches the board through the old name, and its panes follow on
  their next open.
- The fields are additive, so the contract version did not move: every document
  written before them is one this build reads, and moving it would have rewritten
  every board of every vault on its first read.
