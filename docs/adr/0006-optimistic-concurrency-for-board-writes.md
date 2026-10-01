# Detect board write conflicts rather than prevent them

Partly superseded by
[ADR 0022](0022-the-note-decides-and-a-persons-edit-is-optimistic.md): the
version precondition now applies to a person's write as well. The hash check,
the held-board outcomes and the ordering role of the version stand.

When it loads a board file, archboard records the file's hash. Before every
write, archboard makes sure that the file still has that hash. If the file
changed underneath, archboard refuses the write and reports the conflict. It
does not lock, and it does not reload.

Boards are shared with Obsidian, and neither side knows about the other:

- Archboard holds the canvas in memory.
- If a board is open, the Obsidian Excalidraw plugin holds scene state in
  memory.
- A synced vault is effectively a third writer.

Last-writer-wins silently eats hand-arranged work. That is the one failure mode
a board cannot tolerate. The layout _is_ the content, and a person cannot tell
at a glance that a version of it went missing.

This is not theoretical. The Obsidian Excalidraw plugin has a documented class
of data loss. In it, Obsidian Sync overwrites in-progress edits
([#1189](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1189)).
Autosave is repeatedly implicated.

## Considered Options

The first option was convention only. Archboard owns a board while it is open,
and Obsidian is for reading and prose. The documented convention keeps this. The
option was rejected as the whole answer, because it fails silently the first
time someone forgets.

The second option was file-watch and reload: watch the board file and reload on
external change. It was rejected. Excalidraw scenes do not merge meaningfully,
so this discards whatever the canvas held. It swaps which side loses work
silently rather than fixing anything.

The third option was a version number in the frontmatter, bumped on every write
and compared instead of the hash. It was rejected, and it fails in the direction
that costs work. Both Obsidian and archboard carry unknown frontmatter keys
across a save verbatim. So a foreign edit leaves the number exactly where it
was. Archboard reads the same value, concludes that nothing happened, and
overwrites.

A counter is a protocol, so every writer must join it for it to work. `git pull`
is a real writer here. It can move a note backwards to a lower number, or
produce different content at the same number. The hash needs nobody's
cooperation, because it is a property of the bytes.

A note does now carry a version, and this rejection is why the hash is still
what decides (TASK-091). The counter was built for two things that it can do.
The paragraph above never claimed that it cannot do them. First, it orders. So
archboard can say whether the note is ahead of the canvas or behind it, rather
than only that the two differ. Second, it lets a writer state what it was
editing, so two archboard clients cannot both read before either writes.

Neither is a reason to stop hashing. The version orders archboard's own writers,
and the hash catches everybody else's. ADR 0016 already draws that split for the
lock. Here it applies to document state instead of to exclusion.

The pair says more than either half. It compares the version that archboard last
wrote with the version that the note carries now. Three cases follow:

- The number is unchanged but the bytes differ. A writer that does not keep the
  count wrote the note. That is the foreign writer of the paragraph above, named
  rather than inferred.
- The number moved backwards. That is the revert or the `git pull` that the same
  paragraph raises. No equality check can tell one from an ordinary edit.
- The number moved forwards. Another archboard wrote the note, and the
  difference says by how many writes.

The comparison lives in `foreignWriteTo` beside the hash. So the refusal and the
pane's mark say one thing rather than two.

Two rules keep it honest. First, archboard never writes different bytes without
moving the count. That is what makes "unchanged and different" mean somebody
else. So a write that produces the note that is already there does not bump the
count, and two saves of an unchanged board stay byte-identical. Second,
archboard leaves alone a `version` key that holds something it cannot read as a
count, key and value. That is somebody's own property in their own frontmatter,
and the board is unversioned.

The precondition is not a flag that a writer must remember. A number that an
agent threads from one command's answer into the next request is a number that
the agent drops. This repository spent long enough removing invariants that held
only while somebody remembered them. So the canvas fills in the number from what
it last told that writer. It makes sure that the number matches at the write
boundary, where the lock is already held. The canvas can fill it in only for a
writer that it can identify. That turns out to be the writer that the lock can
identify: a claim, whose record lives with the claim.

The canvas never applies the version check to a person. Their gesture took the
board at its leading edge, and refusing it stops a wall display from responding
to the person standing at it. An unclaimed agent's process is anonymous by
construction. Every stand-in for that identity is one that always matches. A
check that cannot fail is worse than no check, so that writer states the version
or claims the board.

## When it fires, after ADR 0015

The decision above is unchanged, and the check still catches every writer the
board mutex cannot (ADR 0016). What moved is the moment.

At the time of writing, somebody wrote a board down by running `board save`. So
the refusal arrived at a moment that a person chose. Under ADR 0015 the note is
the board and every gesture is a write. So the same check now runs about 400 ms
after a finger lifts. A modal at that moment is worse than the problem it
reports. Its best offer is "discard what you just drew".

So the refusal stops the board saving instead of stopping the person. Nothing is
written. The board is marked as not saving, and what the person draws after that
goes into a copy that the canvas keeps.

The person gets the three outcomes below by asking for them: from the mark in
the board bar, from a save they ran, or from the commands. The commands are the
same commands they always were. Archboard still picks none of them. The check
was not weakened to make the experience nicer. That was the temptation worth
naming (TASK-079).

The held copy raises one question that this decision did not have to answer
before: what the outcomes do with the work drawn since. Reload discards it. That
is what "take the note" always meant. Overwrite writes it.

Save elsewhere writes the work to the other note and moves the panes with it.
The board left behind is about to be repainted with the other editor's version,
and watching that happen is not "nothing is lost".

## And said before it is refused

The refusal is still the last moment, and it must not be the first moment that
anybody hears of it. Between somebody else writing the note and the next
gesture, a person draws on a board that the vault no longer holds. Nothing on
screen says so. That gap used to last a session. Under ADR 0015 it lasts as long
as the person spends thinking before they touch something. On a wall display
that is minutes, and it can be an hour.

So the comparison above runs on the boards that are on screen as well as on the
writes. When the comparison comes back positive, the board bar says
`note changed on disk` (TASK-062). It is the same comparison, in one function,
on purpose. The mark claims to show the state in which the next write is
refused. A second implementation of the question is one that drifts.

The mark now says which side is newer (TASK-091). That was the one thing it was
unable to say, and it is the question the mark exists to answer. Three sentences
name three cases:

- The sentence `note is 2 writes ahead` is another archboard working on this
  board.
- The sentence `note was rolled back` is somebody's revert arriving from the
  vault.
- The sentence `note changed on disk` is what is left, an editor that keeps no
  count. The mark used to have this sentence for all three.

That improvement is not a second mechanism. It comes off the one comparison.
That is the whole reason it arrived here for free.

The mark offers the reload and not the three outcomes, because the other two are
not reachable yet. Nothing is refused yet, so there is no held copy to write
over the note and none to write elsewhere. It says instead what does not happen:
nothing is written, nothing is lost, and the next change is refused rather than
saved over theirs.

This state is not a hold and it is not a lock. Both say something adjacent, and
neither says this. A hold is this state one write later, after the refusal
happened. A lock (ADR 0016) is another archboard writer holding the board right
now, which excludes a pane from drawing. This state excludes nobody from
anything.

Riding on the lock watcher's timer rather than a second one keeps the cost
honest. That sweep already runs once per renewal interval and only while a
browser is connected, because a canvas with no tab has nobody to tell. Archboard
reads and hashes a note only after the note's size or modification time moved,
or after archboard's own baseline for it moved. The stat says a note is worth
looking at and never that it changed. Only the hash decides, because a false
positive here puts a mark on somebody's board that says their work is behind,
though it is not.

## Consequences

Saving can fail, so every write path needs a conflict outcome rather than a
boolean. The human chooses: reload and lose local changes, overwrite and lose
theirs, or save elsewhere. Archboard never picks for them.

A board that stops saving holds work that is in the canvas process and in no
note, so a crash costs that work. That is the price of not interrupting, and it
is why the mark stays up rather than being said once.

The check is cheap and prevents nothing. Two writers can still both have a board
open. That is deliberate. The goal is that no edit disappears without someone
being told.
