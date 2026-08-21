# Detect board write conflicts rather than prevent them

Archboard records a board file's hash when it loads it, verifies that hash
before every write, and **refuses the write and reports the conflict** if the
file changed underneath. It does not lock, and it does not reload.

Boards are shared with Obsidian, and neither side knows about the other:
archboard holds the canvas in memory, the Obsidian Excalidraw plugin holds scene
state in memory when a board is open, and a synced vault is effectively a third
writer. Last-writer-wins would silently eat hand-arranged work, which is the one
failure mode a board cannot tolerate — the layout *is* the content, and a person
cannot tell at a glance that a version of it went missing.

This is not theoretical: the Obsidian Excalidraw plugin has a documented class
of data loss where Obsidian Sync overwrites in-progress edits
([#1189](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1189)),
with autosave repeatedly implicated.

## Considered Options

- **Convention only** — archboard owns a board while it is open; Obsidian is for
  reading and prose. Kept as the documented convention, but rejected as the
  whole answer: it fails silently the first time someone forgets.
- **File-watch and reload** — watch the board file and reload on external
  change. Rejected. Excalidraw scenes do not merge meaningfully, so this
  discards whatever the canvas held; it swaps which side loses work silently
  rather than fixing anything.

## When it fires, after ADR 0015

The decision above is unchanged and the check still catches every writer the
board mutex cannot (ADR 0016). What moved is the moment.

This was written when a board was written down by somebody running `board save`,
so the refusal arrived at a moment a person had chosen. Under ADR 0015 the note
is the board and every gesture is a write, so the same check now runs about
400 ms after a finger lifts. A modal at that moment, whose best offer is
"discard what you just drew", is worse than the problem it reports.

So the refusal stops the board saving instead of stopping the person. Nothing is
written, the board is marked as not saving, and what is drawn after that goes
into a copy the canvas keeps. The three outcomes below are offered when the
person asks for them: from the mark in the board bar, from a save they ran, or
from the commands, which are the same commands they always were. Archboard still
picks none of them, and the check has not been weakened to make the experience
nicer, which was the temptation worth naming (TASK-079).

The held copy raises one question this decision did not have to answer before:
what the outcomes do with the work drawn since. Reload discards it, which is
what "take the note" has always meant. Overwrite writes it. Save elsewhere
writes it to the other note and moves the panes with it, because the board left
behind is about to be repainted with the other editor's version and watching
that happen is not "nothing is lost".

## Consequences

Saving can fail, so every write path needs a conflict outcome rather than a
boolean. The human chooses: reload and lose local changes, overwrite and lose
theirs, or save elsewhere. Archboard never picks for them.

A board that has stopped saving holds work that is in the canvas process and in
no note, so a crash costs it. That is the price of not interrupting, and it is
why the mark stays up rather than being said once.

The check is cheap and prevents nothing — two writers can still both have a
board open. That is deliberate. The goal is that no edit disappears without
someone being told.
