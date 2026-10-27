---
status: accepted
---

# Board names are case-insensitive, and case-preserving

Canonical subjects use stable qualified identities and unique-name resolution. The live board-name contract below is superseded.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

A board name was a case-sensitive string. It mapped straight to a filename with
no normalization, so what a name meant depended on the filesystem under the
vault. On Linux, `board new casetest` and `board new CaseTest` made two boards
and two notes. On macOS, APFS is case-insensitive by default. There both
commands addressed one file, and the second one hit a write refusal that it had
no way to explain. A vault is meant to move between machines, and that vault
behaved differently on each.

The key of a board name is the name trimmed, unicode-composed (NFC) and
lowercased. The key is the same on every platform.

The reason is not the filesystem. Boards get named out loud. The whole point of
archboard is a human at a whiteboard talking to an agent, and a human cannot
pronounce casing. "Open payments" must reach the board however somebody wrote
the name down. Two boards that sound identical must not be able to exist,
because nobody can say which one they meant. That constraint is stronger than
any rule that the filesystem imposes, and it points one way.

Unicode normalization is the same argument one level down. macOS historically
writes an accented filename decomposed, and Linux writes it composed. The two
spell the same word, and a human says the word.

## Case-preserving, not case-erasing

Normalizing the key is not the same as lowercasing the name.
`board new Payments` writes `Payments.excalidraw.md` and puts `board: Payments`
in the frontmatter. The address is `payments`, and it always was. A note that
already exists wins, whatever casing it carries. So `payments` finds
`Payments.excalidraw.md` and never creates a second note beside it. APFS and
NTFS behave exactly this way. So a vault looks on Linux the way its author left
it on a Mac.

When a board's file is resolved, the cost is a readdir per path segment. A
case-sensitive filesystem does not do the matching for us. This decision
originally refused a fast path for a name that already matches byte for byte.
The refusal made sure that the answer never depended on how the caller spelled
the address.

_Superseded in part by TASK-153._ Now a note that exists at the byte-equal path
is returned without the readdir. If nothing is there, the walk runs, and only
then. The two answers differ only in a vault that already holds two
case-variants of one name. The section below calls such a vault broken, and
`board list` already reports it as a collision. So the fast path costs nothing
that the vault had not already lost.

## Why not case-sensitive everywhere

The alternative was to keep names case-sensitive and to refuse a new name that
collides case-insensitively with an existing note. A vault stays portable that
way without giving up expressiveness. It is a coherent policy, and it is wrong
for this tool. Under that policy, `Payments` and `payments` stay two different
boards that a human cannot distinguish out loud. So the refusal arrives at the
only useless moment: after the second board already had a reason to exist.
Expressiveness in a name nobody can pronounce is not expressiveness.

## A vault that already holds both

A vault authored on Linux before this decision can hold `payments.excalidraw.md`
and `Payments.excalidraw.md` at once. They are now one address, so only one of
them is reachable. archboard reports the collision from `board list` and names
the files. It does not pick, because which of two notes to keep is not a
decision that can be made from the outside.
