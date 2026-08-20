---
status: accepted
---

# Board names are case-insensitive, and case-preserving

A board name was a case-sensitive string mapped straight to a filename with no
normalisation, so what a name meant depended on the filesystem under the vault.
On Linux `board new casetest` and `board new CaseTest` made two boards and two
notes. On macOS, where APFS is case-insensitive by default, both addressed one
file and the second one hit a write refusal it had no way to explain. A vault is
meant to move between machines, and that one behaved differently on each.

**A board name is normalised on the way in: trimmed, unicode-composed (NFC),
lowercased. That is the key, and it is the same key on every platform.**

The reason is not the filesystem. **Boards get named out loud.** The whole point
of archboard is a human at a whiteboard talking to an agent, and a human cannot
pronounce casing. "Open payments" has to reach the board however it was written
down, and two boards that sound identical must not be able to exist, because
nobody could ever say which one they meant. That constraint is stronger than
anything the filesystem imposes, and it points one way.

Unicode normalisation is the same argument one level down. macOS has
historically written an accented filename decomposed and Linux writes it
composed. The two spell the same word, and a human says the word.

## Case-preserving, not case-erasing

Normalising the key is not lowercasing the name. `board new Payments` writes
`Payments.excalidraw.md` and puts `board: Payments` in the frontmatter; the
address is `payments` and always was. A note that already exists wins whatever
casing it carries, so `payments` finds `Payments.excalidraw.md` and never
creates a second note beside it. That is exactly how APFS and NTFS behave, and
it means a vault looks on Linux the way its author left it on a Mac.

The cost is a readdir per path segment when a board's file is resolved, because
a case-sensitive filesystem will not do the matching for us. There is
deliberately no fast path for a name that already matches byte for byte: it
would make the answer depend on how the caller spelled the address, which is the
one thing this must not do.

## Why not case-sensitive everywhere

The alternative was to keep names case-sensitive and refuse a new name that
collides case-insensitively with an existing note, so a vault stays portable
without giving up expressiveness. It is a coherent policy and it is wrong for
this tool. `Payments` and `payments` would remain two different boards that a
human cannot distinguish out loud, so the refusal would arrive at the only
moment it is useless: after the second board already had a reason to exist.
Expressiveness in a name nobody can pronounce is not expressiveness.

## A vault that already holds both

A vault authored on Linux before this decision can hold `payments.excalidraw.md`
and `Payments.excalidraw.md` at once. They are now one address, so only one of
them is reachable. archboard reports the collision from `board list` and names
the files, and does not pick: which of two notes to keep is not a decision that
can be made from the outside.
